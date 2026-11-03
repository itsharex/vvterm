package app

import (
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// MenuLanguages are the languages the menu bar can be shown in (the first is the fallback).
var MenuLanguages = []string{"en", "vi", "ja", "zh"}

// validMenuLang reports whether lang is one of MenuLanguages.
func validMenuLang(lang string) bool {
	for _, l := range MenuLanguages {
		if l == lang {
			return true
		}
	}
	return false
}

// menuText maps each English menu label to its {vi, ja, zh} translation. The standard macOS menus (App, Edit,
// Window) are made with Wails roles and translated by the system, so they are not here.
var menuText = map[string][3]string{
	// menu titles
	"File": {"Tệp", "ファイル", "文件"},
	"View": {"Xem", "表示", "显示"},
	"Help": {"Trợ giúp", "ヘルプ", "帮助"},
	// File
	"New Connection…":        {"Kết nối mới…", "新規接続…", "新建连接…"},
	"New Host…":              {"Máy chủ mới…", "新規ホスト…", "新建主机…"},
	"New Group…":             {"Nhóm mới…", "新規グループ…", "新建分组…"},
	"New Terminal":           {"Terminal mới", "新規ターミナル", "新建终端"},
	"New Serial Connection…": {"Kết nối serial mới…", "新規シリアル接続…", "新建串行连接…"},
	"Import…":                {"Nhập…", "インポート…", "导入…"},
	"Settings…":              {"Cài đặt…", "設定…", "设置…"},
	"Duplicate Tab":          {"Nhân bản tab", "タブを複製", "复制标签页"},
	"Next Tab":               {"Tab tiếp theo", "次のタブ", "下一个标签页"},
	"Previous Tab":           {"Tab trước", "前のタブ", "上一个标签页"},
	"Close Tab":              {"Đóng tab", "タブを閉じる", "关闭标签页"},
	"Close Pane":             {"Đóng ô", "ペインを閉じる", "关闭窗格"},
	"Lock Vault":             {"Khoá kho bảo mật", "保管庫をロック", "锁定保险库"},
	// View
	"Zoom In":             {"Phóng to", "拡大", "放大"},
	"Zoom Out":            {"Thu nhỏ", "縮小", "缩小"},
	"Actual Size":         {"Kích thước thực", "実際のサイズ", "实际大小"},
	"Split Pane Right":    {"Chia ô sang phải", "ペインを右に分割", "向右拆分窗格"},
	"Split Pane Down":     {"Chia ô xuống dưới", "ペインを下に分割", "向下拆分窗格"},
	"Broadcast Input":     {"Phát đầu vào tới mọi ô", "入力をブロードキャスト", "广播输入"},
	"Command Suggestions": {"Gợi ý lệnh", "コマンド候補", "命令建议"},
	"Show Suggestions":    {"Hiện gợi ý", "候補を表示", "显示建议"},
	"Back to Vaults":      {"Quay lại các kho bảo mật", "保管庫に戻る", "返回保险库"},
	"Hosts":               {"Máy chủ", "ホスト", "主机"},
	"Keychain":            {"Chuỗi khoá", "キーチェーン", "密钥链"},
	"Port Forwarding":     {"Chuyển tiếp cổng", "ポートフォワーディング", "端口转发"},
	"Snippets":            {"Đoạn lệnh", "スニペット", "代码片段"},
	"SFTP":                {"SFTP", "SFTP", "SFTP"},
	"Known Hosts":         {"Máy chủ đã biết", "既知のホスト", "已知主机"},
	"Logs":                {"Nhật ký", "ログ", "日志"},
	"Enter Full Screen":   {"Vào chế độ toàn màn hình", "フルスクリーンにする", "进入全屏"},
	// Help
	"About Vutty":        {"Giới thiệu Vutty", "Vutty について", "关于 Vutty"},
	"Check for Updates…": {"Kiểm tra cập nhật…", "アップデートを確認…", "检查更新…"},
	"Documentation":      {"Tài liệu", "ドキュメント", "文档"},
	"Request a Feature":  {"Đề xuất tính năng", "機能をリクエスト", "请求功能"},
	"Report a Bug":       {"Báo lỗi", "バグを報告", "报告错误"},
	"Release Notes":      {"Ghi chú phát hành", "リリースノート", "发行说明"},
	"Support Vutty…":     {"Ủng hộ Vutty…", "Vutty を応援…", "支持 Vutty…"},
}

// tr is the label in the language lang; an unknown language or a label without an entry stays English.
func tr(lang, label string) string {
	t, ok := menuText[label]
	if !ok {
		return label
	}
	switch lang {
	case "vi":
		return t[0]
	case "ja":
		return t[1]
	case "zh":
		return t[2]
	}
	return label
}

// menuLangFromLocale picks a menu language from a locale such as "vi-VN", "ja_JP.UTF-8" or "zh-Hans-CN"; "" when
// it is none of ours.
func menuLangFromLocale(loc string) string {
	loc = strings.ToLower(strings.TrimSpace(loc))
	for _, l := range MenuLanguages {
		if loc == l || strings.HasPrefix(loc, l+"-") || strings.HasPrefix(loc, l+"_") || strings.HasPrefix(loc, l+".") {
			return l
		}
	}
	return ""
}

// systemMenuLang is the language of the system: on macOS the first of the preferred languages that we have
// (`defaults read -g AppleLanguages`), then LC_ALL / LANG; "en" when nothing is known.
func systemMenuLang() string {
	if runtime.GOOS == "darwin" {
		cmd := exec.Command("defaults", "read", "-g", "AppleLanguages")
		done := make(chan []byte, 1)
		go func() { out, _ := cmd.Output(); done <- out }()
		select {
		case out := <-done:
			for _, line := range strings.Split(string(out), "\n") {
				line = strings.Trim(strings.TrimSpace(line), `(),"`)
				if line == "" {
					continue
				}
				if l := menuLangFromLocale(line); l != "" {
					return l
				}
				break // the first preferred language decides, as the system does
			}
		case <-time.After(2 * time.Second):
			_ = cmd.Process.Kill()
		}
	}
	for _, k := range []string{"LC_ALL", "LANG"} {
		if l := menuLangFromLocale(os.Getenv(k)); l != "" {
			return l
		}
	}
	return "en"
}

// ResolveMenuLang is the menu language for the saved `language` setting: an explicit one as it is, else (auto
// or anything unknown) the system's.
func ResolveMenuLang(setting string) string {
	if validMenuLang(setting) {
		return setting
	}
	return systemMenuLang()
}
