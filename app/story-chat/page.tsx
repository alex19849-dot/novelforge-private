export default function StoryChatPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0f0f0f",
        color: "#ffffff",
        padding: "40px",
        fontFamily: "sans-serif",
      }}
    >
      <h1>NovelForge Chat</h1>

      <p>
        Welcome to the new conversational version of NovelForge.
      </p>

      <div
        style={{
          marginTop: "30px",
          border: "1px solid #333",
          borderRadius: "10px",
          padding: "20px",
          background: "#1a1a1a",
        }}
      >
        <strong>AI</strong>

        <p>
          Hi Alex. What story are we working on today?
        </p>
      </div>

      <input
        type="text"
        placeholder="Tell me what you'd like to do..."
        style={{
          marginTop: "30px",
          width: "100%",
          padding: "15px",
          borderRadius: "8px",
          border: "1px solid #444",
          background: "#222",
          color: "white",
          fontSize: "16px",
        }}
      />
    </main>
  );
}
