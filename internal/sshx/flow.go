package sshx

import (
	"sync"
	"time"
)

// stallLimit is how long output waits for the terminal to say it caught up; after that the wait is given up (a page that
// stopped answering, for example because it is frozen, must not hold the connection for ever).
const stallLimit = 8 * time.Second

// Gate is the flow control between a reader of remote output and the terminal that draws it. The reader counts what it
// hands to the terminal (Sent), the terminal reports how much it has parsed so far (Ack, a running total so that late or
// repeated reports do no harm), and Wait holds the reader back while more than the window is on its way. While the
// reader waits it does not read the connection, so the remote end slows down by itself (the SSH window, TCP).
type Gate struct {
	mu     sync.Mutex
	cond   *sync.Cond
	window int64
	sent   int64
	acked  int64
}

func NewGate(window int) *Gate {
	g := &Gate{window: int64(window)}
	g.cond = sync.NewCond(&g.mu)
	return g
}

// Sent records that n bytes were handed to the terminal.
func (g *Gate) Sent(n int) {
	g.mu.Lock()
	g.sent += int64(n)
	g.mu.Unlock()
}

// Ack records that the terminal has parsed total bytes in all since the last Reset.
func (g *Gate) Ack(total int64) {
	g.mu.Lock()
	if total > g.acked {
		g.acked = total
		g.cond.Broadcast()
	}
	g.mu.Unlock()
}

// Reset starts counting again from zero: a terminal that attaches counts what it receives from then on.
func (g *Gate) Reset() {
	g.mu.Lock()
	g.sent, g.acked = 0, 0
	g.cond.Broadcast()
	g.mu.Unlock()
}

// Wake lets the waiting readers look at their stop condition again.
func (g *Gate) Wake() {
	g.mu.Lock()
	g.cond.Broadcast()
	g.mu.Unlock()
}

// Wait blocks while more than the window is unacknowledged, until the terminal catches up, stop() says so, or stallLimit has passed.
func (g *Gate) Wait(stop func() bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.sent-g.acked <= g.window {
		return
	}
	t := time.AfterFunc(stallLimit, func() { // nobody answers: carry on as if everything had been parsed
		g.mu.Lock()
		g.acked = g.sent
		g.cond.Broadcast()
		g.mu.Unlock()
	})
	defer t.Stop()
	for g.sent-g.acked > g.window && !stop() {
		g.cond.Wait()
	}
}
