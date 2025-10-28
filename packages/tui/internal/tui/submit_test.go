package tui

import (
	"testing"

	tea "github.com/charmbracelet/bubbletea/v2"
	"github.com/sst/opencode/internal/commands"
)

type submitStubEditor struct {
	submit int
	newline int
}

func (s *submitStubEditor) Init() tea.Cmd {
	return nil
}

func (s *submitStubEditor) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	return s, nil
}

func (s *submitStubEditor) View() string {
	return ""
}

func (s *submitStubEditor) Content() string {
	return ""
}

func (s *submitStubEditor) Cursor() *tea.Cursor {
	return nil
}

func (s *submitStubEditor) Lines() int {
	return 0
}

func (s *submitStubEditor) Value() string {
	return ""
}

func (s *submitStubEditor) Length() int {
	return 0
}

func (s *submitStubEditor) Focused() bool {
	return false
}

func (s *submitStubEditor) Focus() (tea.Model, tea.Cmd) {
	return s, nil
}

func (s *submitStubEditor) Blur() {}

func (s *submitStubEditor) Submit() (tea.Model, tea.Cmd) {
	s.submit++
	return s, func() tea.Msg { return nil }
}

func (s *submitStubEditor) SubmitBash() (tea.Model, tea.Cmd) {
	return s, nil
}

func (s *submitStubEditor) Clear() (tea.Model, tea.Cmd) {
	return s, nil
}

func (s *submitStubEditor) Paste() (tea.Model, tea.Cmd) {
	return s, nil
}

func (s *submitStubEditor) Newline() (tea.Model, tea.Cmd) {
	s.newline++
	return s, nil
}

func (s *submitStubEditor) SetValue(value string) {}

func (s *submitStubEditor) SetValueWithAttachments(value string) {}

func (s *submitStubEditor) SetInterruptKeyInDebounce(in bool) {}

func (s *submitStubEditor) SetExitKeyInDebounce(in bool) {}

func (s *submitStubEditor) RestoreFromHistory(index int) {}

func TestInputSubmitDebounceDoublePress(t *testing.T) {
	stub := &submitStubEditor{}
	model := Model{
		editor: stub,
	}

	command := commands.Command{Name: commands.InputSubmitCommand}

	next, _ := model.executeCommand(command)
	current := next.(Model)
	if !current.pendingSubmit {
		t.Fatal("expected pendingSubmit to be true after first submit command")
	}

	final, _ := current.executeCommand(command)
	result := final.(Model)
	if stub.submit != 1 {
		t.Fatalf("expected submit to be called once, got %d", stub.submit)
	}
	if result.pendingSubmit {
		t.Fatal("expected pendingSubmit to be false after second submit command")
	}
}
