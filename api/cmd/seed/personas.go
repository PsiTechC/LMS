package main

// persona is one seeded user. Role matches the user_role Postgres enum exactly.
type persona struct {
	Email             string
	Name              string
	Role              string // superadmin | program_manager | faculty | coach | participant | participant_retailer
	IsRealEmail       bool   // one of the 7 real psitech.co.in / convis.ai addresses
	IsCoachEligible   bool   // gets a row in `coaches` (dedicated coach, or faculty who also coaches)
	CoachProgramScope string // "" = org-wide coach; else a placeholder resolved to a real program ID at runtime
}

// realPersonaEmails lists the 7 real addresses so pre-clean can safely delete
// and recreate them across repeated seed runs without touching anyone else.
func realPersonaEmails() []string {
	return []string{
		"tejas@psitech.co.in",
		"vaishnavi@psitech.co.in",
		"rohit@psitech.co.in",
		"chirag@psitech.co.in",
		"akanksha@psitech.co.in",
		"tejas@convis.ai",
		"siddhesh@convis.ai",
	}
}

// buildPersonaList is the full seeded roster: 7 real + ~23 fake, covering every
// role/persona combination called for in the original ask (plan intro, §1-§2).
func buildPersonaList() []persona {
	list := []persona{
		// ── Real emails - one per key persona type, so you can log in as yourself ──
		{Email: "tejas@psitech.co.in", Name: "Tejas Superadmin", Role: "superadmin", IsRealEmail: true},
		{Email: "vaishnavi@psitech.co.in", Name: "Vaishnavi PM", Role: "program_manager", IsRealEmail: true},
		{Email: "rohit@psitech.co.in", Name: "Rohit Faculty-Coach", Role: "faculty", IsRealEmail: true, IsCoachEligible: true, CoachProgramScope: "orgwide"},
		{Email: "chirag@psitech.co.in", Name: "Chirag Faculty", Role: "faculty", IsRealEmail: true},
		{Email: "akanksha@psitech.co.in", Name: "Akanksha Coach", Role: "coach", IsRealEmail: true, IsCoachEligible: true, CoachProgramScope: "programA"},
		{Email: "tejas@convis.ai", Name: "Tejas Participant", Role: "participant", IsRealEmail: true},
		{Email: "siddhesh@convis.ai", Name: "Siddhesh Retailer", Role: "participant_retailer", IsRealEmail: true},

		// ── Fake bulk faculty (2 more, for 4 total faculty per plan) ──
		{Email: "arjun.mehta@qa.psitech.co.in", Name: "Arjun Mehta", Role: "faculty"},
		{Email: "sunita.rao@qa.psitech.co.in", Name: "Sunita Rao", Role: "faculty"},

		// ── Fake bulk coach (1 more, for 3 total coaches per plan) ──
		{Email: "kabir.singh@qa.psitech.co.in", Name: "Kabir Singh", Role: "coach", IsCoachEligible: true, CoachProgramScope: "orgwide"},
	}

	// ── ~22 fake participants, spread across cohorts (bulk of the roster) ──
	participantNames := []string{
		"Priya Sharma", "Aditya Kapoor", "Neha Iyer", "Rahul Verma", "Ishita Bose",
		"Karan Malhotra", "Divya Nair", "Sameer Khan", "Ananya Gupta", "Vikram Chauhan",
		"Pooja Reddy", "Manish Tiwari", "Ritu Agarwal", "Nikhil Joshi", "Shreya Pillai",
		"Amit Saxena", "Kavya Menon", "Suresh Pandey", "Meera Krishnan", "Rajat Bhatia",
		"Anjali Desai", "Varun Kulkarni",
	}
	for _, n := range participantNames {
		list = append(list, persona{Email: emailSlug(n), Name: n, Role: "participant"})
	}

	return list
}

// emailSlug turns "Priya Sharma" into "priya.sharma@qa.psitech.co.in".
func emailSlug(name string) string {
	out := make([]rune, 0, len(name))
	for _, r := range name {
		switch {
		case r == ' ':
			out = append(out, '.')
		case r >= 'A' && r <= 'Z':
			out = append(out, r+32)
		default:
			out = append(out, r)
		}
	}
	return string(out) + "@" + seedFakeDomain
}
