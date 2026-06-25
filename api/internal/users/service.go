package users

import (
	"errors"

	"github.com/xa-lms/api/internal/shared"
)

func listUsersService(callerRole, callerUserID, role, orgID string, page, limit int) ([]UserResponse, int64, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	var rawUsers []User
	var total int64
	var err error

	if callerRole == shared.RoleSuperAdmin {
		rawUsers, total, err = listAll(role, orgID, offset, limit)
	} else {
		// program_manager: auto-scoped to their own org
		oid, lookupErr := getOrgIDForUser(callerUserID)
		if lookupErr != nil {
			return nil, 0, lookupErr
		}
		if oid == nil {
			return []UserResponse{}, 0, nil
		}
		rawUsers, total, err = listByOrg(*oid, role, offset, limit)
	}
	if err != nil {
		return nil, 0, err
	}

	result := make([]UserResponse, 0, len(rawUsers))
	for _, u := range rawUsers {
		result = append(result, userToDTO(u))
	}
	return result, total, nil
}

func getUserService(id string) (*UserResponse, error) {
	u, err := getByID(id)
	if err != nil {
		return nil, err
	}
	dto := userToDTO(*u)
	return &dto, nil
}

func updateUserService(id string, req UpdateUserRequest, callerRole string) (*UserResponse, error) {
	if req.Role == shared.RoleSuperAdmin && callerRole != shared.RoleSuperAdmin {
		return nil, errors.New("only superadmin can assign the superadmin role")
	}

	fields := map[string]any{}
	if req.Name != "" {
		fields["name"] = req.Name
	}
	if req.Role != "" {
		fields["role"] = req.Role
	}
	if req.IsActive != nil {
		fields["is_active"] = *req.IsActive
	}
	if len(fields) == 0 {
		return nil, errors.New("no fields to update")
	}

	if err := updateUser(id, fields); err != nil {
		return nil, err
	}
	return getUserService(id)
}

func userToDTO(u User) UserResponse {
	return UserResponse{
		ID:        u.ID.String(),
		Email:     u.Email,
		Name:      u.Name,
		Role:      u.Role,
		AvatarURL: u.AvatarURL,
		IsActive:  u.IsActive,
		CreatedAt: u.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}
}
