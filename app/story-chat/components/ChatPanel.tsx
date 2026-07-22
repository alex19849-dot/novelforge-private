 {activeTab === "chat" && (
          <section className="flex-1 space-y-6 overflow-y-auto px-5 py-8">
            {messages.map((message) => {
              const isUser =
                message.role === "user";

             return (
  <div
    key={message.id}
    className={`flex ${
      isUser ? "justify-end" : "justify-start"
    }`}
  >
    <div className="max-w-[85%]">
      <p
        className={`mb-2 text-xs font-semibold uppercase tracking-wider ${
          isUser
            ? "text-right text-neutral-500"
            : "text-pink-500"
        }`}
      >
        {isUser ? "You" : "NovelForge"}
      </p>

      <div className="rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-5 py-4">
        <p className="whitespace-pre-wrap text-[15px] text-neutral-200">
          {message.content}
        </p>
      </div>
    </div>
  </div>
);
})}
                  
            {isThinking && (
              <div className="flex justify-start">
                <div className="max-w-[85%]">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-pink-500">
                    NovelForge
                  </p>

                  <div className="rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-5 py-4 text-[15px] text-neutral-400">
                    Thinking about the
                    story...
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
