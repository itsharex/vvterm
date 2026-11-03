package sshx

import (
	"sync"
	"sync/atomic"
	"time"
)

// Batcher coalesces many small writes into one flush per interval (~16 ms) or when
// maxBytes is reached, so heavy output (tail -f) does not flood the UI with events.
// flush is invoked while holding the lock so chunks are always delivered in order;
// it must therefore be quick and must not call back into the Batcher.
type Batcher struct {
	mu       sync.Mutex
	buf      []byte
	timer    *time.Timer
	interval time.Duration
	maxBytes int
	flush    func([]byte)
	closed   bool
	gate     *Gate       // holds Write back while the terminal is behind (nil: never)
	stopped  atomic.Bool // set by Close; wakes a Write that waits at the gate
}

func NewBatcher(interval time.Duration, maxBytes int, flush func([]byte)) *Batcher {
	return &Batcher{interval: interval, maxBytes: maxBytes, flush: flush}
}

// WithGate makes Write wait while the terminal has not parsed what it was sent: see Gate.
func (b *Batcher) WithGate(g *Gate) *Batcher {
	b.gate = g
	return b
}

func (b *Batcher) Write(p []byte) {
	if b.gate != nil {
		b.gate.Wait(b.stopped.Load) // not holding b.mu: the flush must be able to go on while this waits
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return
	}
	b.buf = append(b.buf, p...)
	if len(b.buf) >= b.maxBytes {
		b.drain()
		return
	}
	if b.timer == nil {
		b.timer = time.AfterFunc(b.interval, func() {
			b.mu.Lock()
			defer b.mu.Unlock()
			b.timer = nil
			b.drain()
		})
	}
}

// drain must be called with b.mu held.
func (b *Batcher) drain() {
	if b.timer != nil {
		b.timer.Stop()
		b.timer = nil
	}
	if len(b.buf) == 0 {
		return
	}
	out := b.buf
	b.buf = nil
	b.flush(out)
}

// Close flushes whatever is pending and stops further writes.
func (b *Batcher) Close() {
	b.stopped.Store(true)
	if b.gate != nil {
		b.gate.Wake()
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.closed = true
	b.drain()
}
