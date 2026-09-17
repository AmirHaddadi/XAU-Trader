import type { Socket } from "node:net";

// A single TCP chunk from SocketSend on the MQL5 side is not guaranteed to
// line up with one JSON message — `SocketReceive` can hand back a partial
// line, or several lines glued together. This buffers raw chunks and only
// ever emits complete, newline-terminated lines.
export class LineFramer {
  private buffer = "";

  push(chunk: string): string[] {
    this.buffer += chunk;
    const lines: string[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (line.length > 0) lines.push(line);
    }
    return lines;
  }
}

export function writeLine(socket: Socket, obj: unknown): void {
  socket.write(JSON.stringify(obj) + "\n");
}
