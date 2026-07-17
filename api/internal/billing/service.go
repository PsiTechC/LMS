package billing

func listParticipantEnrollmentsService() ([]ParticipantEnrollmentDTO, error) {
	rows, err := listParticipantEnrollments()
	if err != nil {
		return nil, err
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
	return out, nil
}
