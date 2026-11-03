package app

import (
	"strings"
	"testing"

	"github.com/wailsapp/wails/v2/pkg/menu"
)

// notTranslated are labels that are the same in every language on purpose.
var notTranslated = map[string]bool{"SFTP": true}

func customLabels(m *menu.Menu) []string {
	var out []string
	for i, top := range m.Items {
		if top.SubMenu == nil || (i != 1 && i != 3 && i != 5) {
			continue // App, Edit and Window (0, 2, 4) are the system's
		}
		out = append(out, top.Label)
		for _, c := range top.SubMenu.Items {
			if !c.IsSeparator() {
				out = append(out, c.Label)
			}
		}
	}
	return out
}

func TestEveryMenuLabelIsTranslated(t *testing.T) {
	en := customLabels(BuildMenu((&menuProbe{}).hooks()))
	if len(en) < 30 {
		t.Fatalf("too few labels: %v", en)
	}
	for _, label := range en {
		e, ok := menuText[label]
		if !ok {
			t.Errorf("%q has no translation", label)
			continue
		}
		for i, lang := range []string{"vi", "ja", "zh"} {
			if strings.TrimSpace(e[i]) == "" {
				t.Errorf("%q has no %s text", label, lang)
			} else if e[i] == label && !notTranslated[label] {
				t.Errorf("%q is not translated to %s", label, lang)
			}
		}
	}
}

func TestMenuLangChangesLabels(t *testing.T) {
	h := (&menuProbe{}).hooks()
	en := customLabels(BuildMenu(h))
	for _, lang := range []string{"vi", "ja", "zh"} {
		h.Lang = lang
		got := customLabels(BuildMenu(h))
		if len(got) != len(en) || strings.Join(got, "|") == strings.Join(en, "|") {
			t.Errorf("%s menu is the English one", lang)
		}
	}
	for _, lang := range []string{"", "xx"} {
		h.Lang = lang
		if strings.Join(customLabels(BuildMenu(h)), "|") != strings.Join(en, "|") {
			t.Errorf("language %q should give English", lang)
		}
	}
}

func TestSetLanguageValidates(t *testing.T) {
	s := NewSystemService()
	for _, bad := range []string{"", "auto", "fr", "VI"} {
		if err := s.SetLanguage(bad); err == nil {
			t.Errorf("%q accepted", bad)
		}
	}
	for _, ok := range MenuLanguages {
		if err := s.SetLanguage(ok); err != nil || s.MenuLang() != ok {
			t.Errorf("%q: %v / %q", ok, err, s.MenuLang())
		}
	}
}

func TestMenuLangFromLocale(t *testing.T) {
	for in, want := range map[string]string{"vi-VN": "vi", "ja_JP.UTF-8": "ja", "zh-Hans-CN": "zh", "en-US": "en", "fr-FR": "", "": ""} {
		if got := menuLangFromLocale(in); got != want {
			t.Errorf("%q: %q want %q", in, got, want)
		}
	}
	if ResolveMenuLang("ja") != "ja" {
		t.Error("explicit language must win")
	}
}
