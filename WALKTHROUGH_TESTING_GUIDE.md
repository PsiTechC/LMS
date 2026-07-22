# Intellique — Walkthrough / Testing Guide

A straightforward, role-by-role manual QA pass across the whole platform. Follow each
role in order — later roles depend on data created by earlier ones (org → program →
enrollment → participant activity). Note any issue you hit against the relevant step.

---

## 1. Superadmin

Login as Superadmin and explore all tabs.

### 1.1 Onboard Organization
- Set up its configuration — size and other org-level settings
- Set color palette / branding
- Create a Program Manager
- Set up competencies

### 1.2 Design Program for this org
- Add activities/modules, configure dates
- Add prework, postwork, add elements
- Attach assets and assessments to any activity, or the assessment itself — quiz, survey, etc.
- Create assets if not already created, then attach them
- Publish the program

### 1.3 Program Management
- Enroll participants into the program, including bulk enrollment
- Check emails for invitations, accept invitations, and enroll into the program

### 1.4 Faculty Management
- Onboard faculty
- Faculty should enroll via the email invite link
- Assign faculty to a program

### 1.5 Coaching Admin
- Enroll a coach
- Initiate a coaching assignment

### 1.6 Configure 360 Feedback for the org
- Fill in the definition of competencies
- Set up behavior statements, quorums, and lock the configuration

---

## 2. Program Manager

Login as Program Manager.

- Design / configure a program, and publish it
- Create cohorts
- Add / onboard / assign faculty
- Explore other tabs
- Configure 360-degree feedback for participants (same as Superadmin)

---

## 3. Faculty

Login as Faculty.

- Faculty can also design a program and enroll participants
- Check out prework / postwork in the program's session view
- Create a session, join sessions, take notes, take attendance in the Program Sessions tab
  - For a participant to join the same meeting, faculty must start the session by
    clicking on it, then launch attendance
  - From the participant side, they then mark attendance and join the session
- Grade student assessments and quizzes in the Assessments tab
- Configure the capstone project if one is scheduled in the program, under the
  Capstone Projects tab
- Create discussions across organizations / threads, or post an Announcement in the
  Discussions tab

---

## 4. Participant

Login as Participant.

- Explore tabs and the dashboard
- Complete prework: learning modules, videos, assessments, case studies, etc.
- In the Live Sessions tab, check the calendar and scheduled sessions, and join once
  faculty starts the session
- In the Assessments tab, check upcoming, pending, and completed assessments
- Complete 360 feedback in the 360 Feedback tab:
  - Nominate raters, send invites
  - Self-rate
  - Check as raters respond
  - Review analytics and the feedback report once the minimum quorum completes the form
- Do coaching activities — join a session when the coach initiates one
- Check your cohorts under My Cohort
- Check your Capstone tab — the capstone project assigned by faculty, group learning,
  document uploads, and final submission; wait for faculty review
- Complete surveys if pending; check completed vs. upcoming
- Complete L1–L4 feedback if assigned in a phase
  *(under development — basic functionality only)*
- In the Discussions tab, respond to discussions and direct-message other participants
  in that program

---

## 5. Coach

Login as Coach.

- Check out sessions and coaching assignments
- Schedule sessions
- Upload reports

---

## 6. Participant (Retailer variant)

- Conduct 360 feedback
- Submit assessments
- Track coaching activities

---

## 7. Secondary Superadmin

- Same as Superadmin, with some tabs locked — confirm which tabs are restricted and
  that the lock actually holds

---

## Notes

- Flag any issue against the specific step above so it's traceable.
- Questions or blockers — raise them as you go rather than at the end.
