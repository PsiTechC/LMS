package certificates

// certificatePlacement/certificatePlacements mirror content.CertificateConfig's
// Placements shape exactly (see content/meta_types.go) but are defined locally
// rather than imported, since modules never import each other's Go packages
// (CLAUDE.md) - this module reads the template's raw JSON meta directly (see
// repository.go's getTemplateAsset) and unmarshals it into these local types,
// the same "read the other module's table via raw SQL, define your own
// row/DTO shape" convention zoom uses for class_sessions (sessionZoomRow) and
// sessions uses for zoom_join_url etc.
type certificatePlacement struct {
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	FontSize   float64 `json:"font_size"`
	Color      string  `json:"color"`
	FontFamily string  `json:"font_family,omitempty"`
	Bold       bool    `json:"bold,omitempty"`
	Italic     bool    `json:"italic,omitempty"`
}

type certificateLogoCopy struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
}

type certificateCustomText struct {
	ID   string `json:"id"`
	Text string `json:"text"`
	certificatePlacement
}

type certificatePlacements struct {
	FontFamily  string                          `json:"font_family"`
	Fields      map[string]certificatePlacement `json:"fields"`
	LogoCopies  []certificateLogoCopy           `json:"logo_copies,omitempty"`
	CustomTexts []certificateCustomText         `json:"custom_texts,omitempty"`
}

// certificateConfig is the subset of content.CertificateConfig this module
// needs to read back out of a certificate template asset's meta JSON.
type certificateConfig struct {
	Placements *certificatePlacements `json:"placements,omitempty"`
}
