package billing

func listParticipantEnrollmentsService(page, limit int) ([]ParticipantEnrollmentDTO, int64, error) {
	offset := (page - 1) * limit
	rows, total, err := listParticipantEnrollments(offset, limit)
	if err != nil {
		return nil, 0, err
	}
	out := make([]ParticipantEnrollmentDTO, 0, len(rows))
	for _, r := range rows {
		dto := ParticipantEnrollmentDTO{
			UserID:       r.UserID,
			Name:         r.Name,
			Email:        r.Email,
			ProgramTitle: r.ProgramTitle,
			StartDate:    r.EnrolledAt,
		}
		if r.CompletedAt != nil {
			dto.EndDate = *r.CompletedAt
		}
		out = append(out, dto)
	}
	return out, total, nil
}
