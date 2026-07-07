package shared

import "github.com/labstack/echo/v4"

type Meta struct {
	Page    int   `json:"page"`
	PerPage int   `json:"per_page"`
	Total   int64 `json:"total"`
}

type ErrorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
}

type envelope struct {
	Data  any          `json:"data"`
	Meta  *Meta        `json:"meta,omitempty"`
	Error *ErrorDetail `json:"error"`
}

func OK(c echo.Context, data any) error {
	return c.JSON(200, envelope{Data: data, Error: nil})
}

func OKList(c echo.Context, data any, meta Meta) error {
	return c.JSON(200, envelope{Data: data, Meta: &meta, Error: nil})
}

func Created(c echo.Context, data any) error {
	return c.JSON(201, envelope{Data: data, Error: nil})
}

func NoContent(c echo.Context) error {
	return c.NoContent(204)
}

func errJSON(c echo.Context, status int, code, msg, field string) error {
	return c.JSON(status, envelope{Data: nil, Error: &ErrorDetail{Code: code, Message: msg, Field: field}})
}

func BadRequest(c echo.Context, code, msg, field string) error {
	return errJSON(c, 400, code, msg, field)
}

func UnprocessableEntity(c echo.Context, code, msg, field string) error {
	return errJSON(c, 422, code, msg, field)
}

func Unauthorized(c echo.Context, msg string) error {
	return errJSON(c, 401, "UNAUTHORIZED", msg, "")
}

func Forbidden(c echo.Context) error {
	return errJSON(c, 403, "FORBIDDEN", "you do not have permission to perform this action", "")
}

func NotFound(c echo.Context, msg string) error {
	return errJSON(c, 404, "NOT_FOUND", msg, "")
}

func Conflict(c echo.Context, msg string) error {
	return errJSON(c, 409, "CONFLICT", msg, "")
}

func InternalError(c echo.Context, msg string) error {
	return errJSON(c, 500, "INTERNAL_ERROR", msg, "")
}
