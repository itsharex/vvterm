package sshx

import (
	"sync"
	"testing"
	"time"
)

func TestGateHoldsWriterUntilTerminalCatchesUp(t *testing.T) {
	g := NewGate(100)
	var mu sync.Mutex
	var got int
	b := NewBatcher(time.Millisecond, 1<<20, func(p []byte) {
		mu.Lock()
		got += len(p)
		mu.Unlock()
		g.Sent(len(p))
	}).WithGate(g)
	defer b.Close()

	b.Write(make([]byte, 150)) // goes through: nothing was unparsed yet
	deadline := time.Now().Add(2 * time.Second)
	for {
		mu.Lock()
		n := got
		mu.Unlock()
		if n == 150 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("first write was not delivered")
		}
		time.Sleep(time.Millisecond)
	}

	done := make(chan struct{})
	go func() { b.Write(make([]byte, 10)); close(done) }()
	select {
	case <-done:
		t.Fatal("write went through while 150 bytes (more than the window of 100) were unparsed")
	case <-time.After(100 * time.Millisecond):
	}
	g.Ack(60) // 90 left: inside the window
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("write still held after the terminal caught up")
	}
}

func TestGateLateAndRepeatedAcksDoNoHarm(t *testing.T) {
	g := NewGate(10)
	g.Sent(100)
	g.Ack(80)
	g.Ack(50) // an old report arriving late
	g.Ack(80)
	if g.sent-g.acked != 20 {
		t.Fatalf("unparsed = %d, want 20", g.sent-g.acked)
	}
	g.Reset()
	if g.sent != 0 || g.acked != 0 {
		t.Fatal("Reset did not start from zero")
	}
}

func TestGateCloseOfBatcherReleasesAWaitingWriter(t *testing.T) {
	g := NewGate(10)
	g.Sent(1000)
	b := NewBatcher(time.Millisecond, 1<<20, func([]byte) {}).WithGate(g)
	done := make(chan struct{})
	go func() { b.Write([]byte("x")); close(done) }()
	time.Sleep(50 * time.Millisecond)
	b.Close()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("a writer waiting at the gate was not released by Close")
	}
}

func TestGateGivesUpWhenNobodyAnswers(t *testing.T) {
	if testing.Short() {
		t.Skip("waits for the stall limit")
	}
	g := NewGate(10)
	g.Sent(1000)
	start := time.Now()
	g.Wait(func() bool { return false })
	if d := time.Since(start); d < stallLimit-time.Second || d > stallLimit+3*time.Second {
		t.Fatalf("gave up after %v, want about %v", d, stallLimit)
	}
}
