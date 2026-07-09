"use client";
// Last-resort boundary for errors in the root layout itself (must render <html>/<body>).
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem", textAlign: "center" }}>
        <h1 style={{ color: "#0a3d7a" }}>GovUX Audit Platform</h1>
        <p style={{ color: "#5b6b85" }}>The application hit an unexpected error. Please try again.</p>
        <button onClick={() => reset()}
          style={{ marginTop: "1rem", padding: ".5rem 1.25rem", border: 0, borderRadius: 8,
                   background: "#0d6efd", color: "#fff", cursor: "pointer" }}>
          Reload
        </button>
      </body>
    </html>
  );
}
