package payments

import (
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/payments/paypal"
	"github.com/xa-lms/api/internal/shared"
)

type VerifyCheckoutRequest struct {
	RazorpayOrderID   string `json:"razorpay_order_id"`
	RazorpayPaymentID string `json:"razorpay_payment_id"`
	RazorpaySignature string `json:"razorpay_signature"`
}

// CreatePaymentOrderRequest's Provider is optional - a participant may
// manually choose "razorpay" or "paypal"; omitting it preserves the
// original currency-only routing (SelectProvider).
type CreatePaymentOrderRequest struct {
	Provider string `json:"provider,omitempty"`
}

type Handler struct {
	client     RazorpayClient
	loadConfig func() (Config, error)

	// PayPal wiring - additive, alongside the Razorpay fields above (see
	// createPaymentOrder's dispatch on SelectProvider). NewHandlerWithClient
	// (Razorpay-only test constructor) leaves these nil; createPaypalPaymentOrder
	// falls back to paypal.LoadConfig/paypal.NewClient when unset, so that's safe.
	paypalClient     paypal.Client
	loadPaypalConfig func() (paypal.Config, error)
}

func NewHandler() *Handler {
	return &Handler{loadConfig: LoadConfig, loadPaypalConfig: paypal.LoadConfig}
}
func NewHandlerWithClient(client RazorpayClient, config Config) *Handler {
	return &Handler{client: client, loadConfig: func() (Config, error) { return config, nil }}
}
func (h *Handler) Register(v1 *echo.Group) {
	group := v1.Group("/open-programs", shared.RequireAuth())
	group.POST("/:programID/payment-orders", h.createPaymentOrder)
	paymentOrders := v1.Group("/open-programs/payment-orders", shared.RequireAuth())
	paymentOrders.GET("/:id", h.getPaymentOrderStatus)
	paymentOrders.POST("/:id/capture-paypal", h.capturePaypalOrder)
	verify := v1.Group("/payments", shared.RequireAuth())
	verify.POST("/razorpay/verify", h.verifyCheckout)
	webhook := v1.Group("/payments/razorpay")
	webhook.POST("/webhook", h.webhook)
	paypalWebhook := v1.Group("/payments/paypal")
	paypalWebhook.POST("/webhook", h.paypalWebhook)
}

// createPaymentOrder dispatches to the Razorpay or PayPal flow. A caller may
// explicitly choose the provider via the request body (participant's manual
// choice in the frontend); if omitted, this falls back to the program's
// currency (SelectProvider - see provider.go) exactly as before manual
// choice existed. The Razorpay branch (createRazorpayPaymentOrder) is the
// exact same body this handler always ran, just extracted so it can be
// dispatched to conditionally - its behavior for Razorpay requests is
// unchanged.
func (h *Handler) createPaymentOrder(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	participantID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return shared.Unauthorized(c, "invalid account")
	}
	programID, err := uuid.Parse(c.Param("programID"))
	if err != nil {
		return shared.NotFound(c, "program not found")
	}

	var req CreatePaymentOrderRequest
	_ = c.Bind(&req) // body is optional - a bind error just leaves Provider empty
	provider := strings.ToLower(strings.TrimSpace(req.Provider))
	if provider != "" && provider != "razorpay" && provider != "paypal" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "provider must be razorpay or paypal", "provider")
	}

	if provider == "" {
		provider = SelectProvider("INR")
	}

	if provider == "paypal" {
		return h.createPaypalPaymentOrder(c, participantID, programID)
	}
	return h.createRazorpayPaymentOrder(c, participantID, programID)
}

func (h *Handler) createRazorpayPaymentOrder(c echo.Context, participantID, programID uuid.UUID) error {
	config, err := h.loadConfig()
	if err != nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]any{"data": nil, "error": shared.ErrorDetail{Code: "PAYMENTS_UNAVAILABLE", Message: "payments are unavailable"}})
	}
	client := h.client
	if client == nil {
		client = NewRazorpayClient(config, nil)
	}
	result, err := CreateCheckoutPaymentOrder(c.Request().Context(), participantID, programID, client, config.KeyID)
	switch {
	case err == nil:
		return shared.Created(c, result)
	case errors.Is(err, ErrProgramNotFound):
		return shared.NotFound(c, "program not found")
	case errors.Is(err, ErrPaymentNotRequired), errors.Is(err, ErrInvalidProgramPrice):
		return shared.BadRequest(c, "PAYMENT_NOT_AVAILABLE", "payment is not available for this program", "")
	case errors.Is(err, ErrAlreadyEnrolled):
		return shared.Conflict(c, "participant is already enrolled")
	case errors.Is(err, ErrProviderOrderCreationFailed):
		return c.JSON(http.StatusBadGateway, map[string]any{"data": nil, "error": shared.ErrorDetail{Code: "PAYMENT_PROVIDER_ERROR", Message: "payment provider order creation failed"}})
	default:
		return shared.InternalError(c, "failed to create payment order")
	}
}

func (h *Handler) createPaypalPaymentOrder(c echo.Context, participantID, programID uuid.UUID) error {
	loadPaypalConfig := h.loadPaypalConfig
	if loadPaypalConfig == nil {
		loadPaypalConfig = paypal.LoadConfig
	}
	config, err := loadPaypalConfig()
	if err != nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]any{"data": nil, "error": shared.ErrorDetail{Code: "PAYMENTS_UNAVAILABLE", Message: "payments are unavailable"}})
	}
	client := h.paypalClient
	if client == nil {
		client = paypal.NewClient(config, nil)
	}
	result, err := CreatePaypalCheckoutPaymentOrder(c.Request().Context(), participantID, programID, client)
	switch {
	case err == nil:
		return shared.Created(c, result)
	case errors.Is(err, ErrProgramNotFound):
		return shared.NotFound(c, "program not found")
	case errors.Is(err, ErrPaymentNotRequired), errors.Is(err, ErrInvalidProgramPrice):
		return shared.BadRequest(c, "PAYMENT_NOT_AVAILABLE", "payment is not available for this program", "")
	case errors.Is(err, ErrAlreadyEnrolled):
		return shared.Conflict(c, "participant is already enrolled")
	case errors.Is(err, ErrProviderOrderCreationFailed):
		return c.JSON(http.StatusBadGateway, map[string]any{"data": nil, "error": shared.ErrorDetail{Code: "PAYMENT_PROVIDER_ERROR", Message: "payment provider order creation failed"}})
	default:
		log.Printf("[payments] create paypal payment order failed program=%s participant=%s: %v", programID, participantID, err)
		return shared.InternalError(c, "failed to create payment order")
	}
}

// capturePaypalOrder triggers the real PayPal capture server-side after the
// buyer approves in the popup - never trusted alone client-side. Does not
// finalize/enroll; see CapturePaypalOrder's doc comment for why the webhook
// stays the sole source of truth for that.
func (h *Handler) capturePaypalOrder(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	participantID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return shared.Unauthorized(c, "invalid account")
	}
	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return shared.NotFound(c, "payment order not found")
	}
	loadPaypalConfig := h.loadPaypalConfig
	if loadPaypalConfig == nil {
		loadPaypalConfig = paypal.LoadConfig
	}
	config, err := loadPaypalConfig()
	if err != nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]any{"data": nil, "error": shared.ErrorDetail{Code: "PAYMENTS_UNAVAILABLE", Message: "payments are unavailable"}})
	}
	client := h.paypalClient
	if client == nil {
		client = paypal.NewClient(config, nil)
	}
	result, err := CapturePaypalOrder(c.Request().Context(), participantID, orderID, client)
	switch {
	case err == nil:
		return shared.OK(c, result)
	case errors.Is(err, ErrPaymentOrderNotFound):
		return shared.NotFound(c, "payment order not found")
	case errors.Is(err, ErrProviderOrderMismatch):
		return shared.BadRequest(c, "VALIDATION_ERROR", "this payment order is not a paypal order", "")
	default:
		return c.JSON(http.StatusBadGateway, map[string]any{"data": nil, "error": shared.ErrorDetail{Code: "PAYMENT_PROVIDER_ERROR", Message: "capture failed"}})
	}
}

// getPaymentOrderStatus is polled by the frontend after triggering a PayPal
// capture, until the webhook-driven finalization completes.
func (h *Handler) getPaymentOrderStatus(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	participantID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return shared.Unauthorized(c, "invalid account")
	}
	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return shared.NotFound(c, "payment order not found")
	}
	result, err := GetPaymentOrderStatusForParticipant(orderID, participantID)
	if err != nil {
		if errors.Is(err, ErrPaymentOrderNotFound) {
			return shared.NotFound(c, "payment order not found")
		}
		return shared.InternalError(c, "failed to load payment order status")
	}
	return shared.OK(c, result)
}

func (h *Handler) verifyCheckout(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	participantID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return shared.Unauthorized(c, "invalid account")
	}
	var req VerifyCheckoutRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid payment verification request", "")
	}
	if req.RazorpayOrderID == "" || req.RazorpayPaymentID == "" || req.RazorpaySignature == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "provider order, payment and signature are required", "")
	}
	config, err := h.loadConfig()
	if err != nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]any{"data": nil, "error": shared.ErrorDetail{Code: "PAYMENTS_UNAVAILABLE", Message: "payments are unavailable"}})
	}
	client := h.client
	if client == nil {
		client = NewRazorpayClient(config, nil)
	}
	result, err := VerifyAndFinalizeCheckout(c.Request().Context(), VerifyCheckoutInput{ParticipantID: participantID, ProviderOrderID: req.RazorpayOrderID, ProviderPaymentID: req.RazorpayPaymentID, Signature: req.RazorpaySignature}, config.KeySecret, client)
	switch {
	case err == nil:
		return shared.OK(c, result)
	case errors.Is(err, ErrPaymentOrderNotFound), errors.Is(err, ErrCheckoutPaymentNotFound):
		return shared.NotFound(c, "payment order not found")
	case errors.Is(err, ErrPaymentOrderOrganization), errors.Is(err, ErrPaymentOrderOwnership):
		return shared.Forbidden(c)
	case errors.Is(err, ErrInvalidCheckoutSignature):
		return shared.UnprocessableEntity(c, "INVALID_PAYMENT_SIGNATURE", "payment verification failed", "razorpay_signature")
	case errors.Is(err, ErrProviderAmountMismatch), errors.Is(err, ErrProviderCurrencyMismatch), errors.Is(err, ErrProviderOrderMismatch):
		return shared.UnprocessableEntity(c, "PAYMENT_MISMATCH", "payment verification failed", "")
	case errors.Is(err, ErrPaymentNotCaptured):
		return shared.Conflict(c, "payment is not captured")
	case errors.Is(err, ErrPaymentOrderConflict):
		return shared.Conflict(c, "payment order has already been finalized with another payment")
	default:
		return c.JSON(http.StatusBadGateway, map[string]any{"data": nil, "error": shared.ErrorDetail{Code: "PAYMENT_PROVIDER_ERROR", Message: "payment verification failed"}})
	}
}
