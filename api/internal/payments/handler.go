package payments

import (
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type VerifyCheckoutRequest struct {
	RazorpayOrderID   string `json:"razorpay_order_id"`
	RazorpayPaymentID string `json:"razorpay_payment_id"`
	RazorpaySignature string `json:"razorpay_signature"`
}

type Handler struct {
	client     RazorpayClient
	loadConfig func() (Config, error)
}

func NewHandler() *Handler { return &Handler{loadConfig: LoadConfig} }
func NewHandlerWithClient(client RazorpayClient, config Config) *Handler {
	return &Handler{client: client, loadConfig: func() (Config, error) { return config, nil }}
}
func (h *Handler) Register(v1 *echo.Group) {
	group := v1.Group("/open-programs", shared.RequireAuth())
	group.POST("/:programID/payment-orders", h.createPaymentOrder)
	verify := v1.Group("/payments", shared.RequireAuth())
	verify.POST("/razorpay/verify", h.verifyCheckout)
	webhook := v1.Group("/payments/razorpay")
	webhook.POST("/webhook", h.webhook)
}
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
