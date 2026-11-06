import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { ChatMessage, StoryState } from '../types';
import { guidanceMessageIndex, isGuidanceProposal } from '../../../lib/chapter-guidance';

type ChatPanelProps = {
  messages: ChatMessage[];
  isThinking: boolean;
  guidanceDraft?: StoryState['chapterGuidanceDraft'];
  guidance?: ReactNode;
};
export default function ChatPanel({ messages, isThinking, guidanceDraft, guidance }: ChatPanelProps) {
  const scrollContainerRef = useRef<HTMLElement>(null);
  const guidanceRef = useRef<HTMLDivElement>(null);
  const activeIndex = guidanceDraft ? guidanceMessageIndex(messages, guidanceDraft.text) : -1;
  const hasCurrentGuidance = Boolean(guidanceDraft?.text && !guidanceDraft.awaitingAnswer && guidance);
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (hasCurrentGuidance && guidanceRef.current) container.scrollTop = guidanceRef.current.offsetTop - container.offsetTop;
    else container.scrollTop = container.scrollHeight;
  }, [messages.length, guidanceDraft?.updatedAt, hasCurrentGuidance]);
  return <section aria-label="Story conversation" ref={scrollContainerRef} className="relative min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
    {messages.map((message, index) => {
      const isUser = message.role === 'user';
      if (!isUser && index === activeIndex && hasCurrentGuidance) return null;
      return <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className="min-w-0 max-w-[95%] sm:max-w-[85%]">
          <p className={`mb-2 text-xs font-semibold uppercase tracking-wider ${isUser ? 'text-right text-neutral-500' : 'text-pink-500'}`}>{isUser ? 'You' : 'NovelForge'}</p>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            {!isUser && isGuidanceProposal(message.content) ? <details><summary className="cursor-pointer text-sm text-neutral-400">Earlier guidance (not active)</summary><p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-7 text-neutral-200">{message.content}</p></details> : <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-neutral-200">{message.content}</p>}
          </div>
        </div>
      </div>;
    })}
    {hasCurrentGuidance && <div ref={guidanceRef}>{guidance}</div>}
    {isThinking && <p role="status" className="text-sm text-neutral-400">Working on your story...</p>}
  </section>;
}
