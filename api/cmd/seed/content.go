package main

import "log"

// contentAssetRef is the subset of AssetDTO the seed script needs after
// upload — just enough to wire asset_id into an activity's config_json.
type contentAssetRef struct {
	ID string `json:"id"`
}

// sample file bodies — small, real, self-contained. The .pptx is a minimal
// valid OOXML zip (not just bytes named ".pptx") so it opens correctly if a
// QA tester actually downloads it; the .md/.txt are plain text.
var sampleMarkdown = []byte(`# Leadership Styles — Pre-Read

Before the classroom session, review these four leadership styles:

1. **Directive** — clear instructions, close supervision. Best for crisis or novice teams.
2. **Coaching** — high support, high challenge. Best for developing high-potential talent.
3. **Supporting** — collaborative, shared decision-making. Best for experienced, motivated teams.
4. **Delegating** — hands-off, trust-based. Best for high-autonomy experts.

Come prepared to discuss which style you default to and why.
`)

var sampleReadme = []byte(`Program Reference Notes
========================

This document accompanies the "Data-Driven Decisions" virtual session.

Key frameworks covered:
- OODA loop (Observe, Orient, Decide, Act)
- Cost-of-delay vs. cost-of-being-wrong tradeoff matrix
- Decision reversibility test (one-way vs. two-way doors)

Bring one real decision from your team to work through live during the session.
`)

// minimalPPTX is a valid, minimal OOXML .pptx (single blank slide) built as a
// raw zip byte stream, so uploaded/downloaded copies actually open in
// PowerPoint rather than just carrying a .pptx extension on garbage bytes.
func minimalPPTX() []byte {
	return buildMinimalPptxZip()
}

// uploadAsset creates one content_assets row via the real multipart API
// (content:create — program_manager/superadmin only, per rbac.go) and returns
// its ID for later asset_id wiring into activity config_json.
func (rt *runtime) uploadAsset(actor *apiClient, title, description, assetType, fileName string, fileBytes []byte) (*contentAssetRef, error) {
	var out contentAssetRef
	fields := map[string]string{
		"title":       title,
		"description": description,
		"asset_type":  assetType,
	}
	if err := actor.postMultipart("/api/v1/content/assets?org_id="+rt.orgID, fields, "file", fileName, fileBytes, &out); err != nil {
		return nil, err
	}
	log.Printf("  ✅ content asset uploaded: %s (%s, type=%s)", title, out.ID, assetType)
	return &out, nil
}

// setActivityAssetID PATCHes an already-created activity's config_json to
// reference an uploaded content asset — the same app-level convention (no DB
// FK) that PMDesignStudio uses when a PM attaches a file to a pre/post-work
// slot from the Content Library picker.
func (rt *runtime) setActivityAssetID(actor *apiClient, programID string, act *activityRef, extraConfig map[string]any, assetID string) error {
	cfg := map[string]any{"asset_id": assetID}
	for k, v := range extraConfig {
		cfg[k] = v
	}
	body := map[string]any{"config": cfg}
	return actor.patch("/api/v1/programs/"+programID+"/activities/"+act.ID, body, nil)
}

// buildContentLibrary uploads a handful of real sample files (md/txt/pptx)
// into the org's Content Library and attaches them to specific pre-work /
// post-work activities across Programs A and D, so the library isn't empty
// and pre/post-work cards actually resolve to a downloadable file.
func (rt *runtime) buildContentLibrary(progA *programRef, progD *programRef) error {
	log.Println("📎 building content library + attaching to pre/post-work...")

	caseStudyDoc, err := rt.uploadAsset(rt.pm,
		"Leadership Styles — Pre-Read", "Four leadership styles primer for Module 1 pre-work.",
		"case_study", "leadership-styles-preread.md", sampleMarkdown)
	if err != nil {
		return err
	}
	if err := rt.setActivityAssetID(rt.pm, progA.ID, rt.progAActivities.PreWorkCaseStudy, nil, caseStudyDoc.ID); err != nil {
		return err
	}

	decisionDoc, err := rt.uploadAsset(rt.pm,
		"Data-Driven Decisions — Reference Notes", "Frameworks reference doc for the virtual session.",
		"elearning", "decision-frameworks-notes.txt", sampleReadme)
	if err != nil {
		return err
	}
	if err := rt.setActivityAssetID(rt.pm, progA.ID, rt.progAActivities.VirtualLive, map[string]any{"session_type": "virtual"}, decisionDoc.ID); err != nil {
		return err
	}

	orientationDeck, err := rt.uploadAsset(rt.pm,
		"Program Orientation Deck", "Welcome slides used in orientation video/session.",
		"video", "program-orientation-deck.pptx", minimalPPTX())
	if err != nil {
		return err
	}
	if err := rt.setActivityAssetID(rt.pm, progA.ID, rt.progAActivities.OrientVideo, nil, orientationDeck.ID); err != nil {
		return err
	}

	kickoffDeck, err := rt.uploadAsset(rt.pm,
		"Digital Transformation — Kickoff Deck", "Day-one orientation deck for the new cohort.",
		"video", "digital-transformation-kickoff.pptx", minimalPPTX())
	if err != nil {
		return err
	}
	if err := rt.setActivityAssetID(rt.pm, progD.ID, rt.progDActivities.OrientVideo, nil, kickoffDeck.ID); err != nil {
		return err
	}

	briefDoc, err := rt.uploadAsset(rt.pm,
		"Digital Transformation — Pre-Work Brief", "Case brief participants read before Module 1.",
		"case_study", "digital-transformation-brief.md", sampleMarkdown)
	if err != nil {
		return err
	}
	if err := rt.setActivityAssetID(rt.pm, progD.ID, rt.progDActivities.PreWorkCaseStudy, nil, briefDoc.ID); err != nil {
		return err
	}

	log.Println("✅ content library built: 5 assets uploaded and attached")
	return nil
}
