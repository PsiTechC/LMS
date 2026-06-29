package users

import "github.com/xa-lms/api/internal/auth"

// User is the same struct as auth.User — both map to the users table.
// This module provides management operations on that table.
type User = auth.User
