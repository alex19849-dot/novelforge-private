# Scene slides

Create → Scene slides adds a two-moment romantic sequence followed by the genuine book cover, as three downloadable 1080×1920 JPEGs and one H264 MP4. Reading time is calculated from the two text panels; the cover reveal lasts four seconds. Existing poster creation remains available.

The scene plan includes editable character descriptions, image directions and text. A pasted manuscript passage enables exact-excerpt mode: text must be present in the passage and remain in source order. Without a passage, copy is labelled as a premise adaptation, not a quotation. Photos depict fictional adult male leads; the second image edit references the first image for identity continuity. A two-image quality/continuity check runs before rendering. Users review the final images before saving or publishing.

`POST /api/social-studio/slides` authenticates the owner and supports `plan` and `generate`. It stores plans and completed stages in the existing owner-scoped `social_creative_prompts` table. Generation uses the existing durable queue with kind `social` and arguments `[promptId, "scene-slides", receiptId]`; no Workflow runner or schema migration is introduced. Duplicate/CAS claims fence repeated requests. Photos are keyed by cast and shot directions, so text and soundtrack edits reuse completed photographs. Each stage saves progress before moving on. Interrupted paid requests are not automatically replayed.

Native-audio export is the default: it contains no baked-in music. The user adds available sounds in TikTok, Reels or Shorts and posts there. Saving this mode creates a draft with no posting date and `native_audio_required: true`; both approval validation and provider payload creation reject automatic posting of that version. Separate images can be used for a TikTok photo carousel. Automatic delivery optionally embeds a user-selected, previewable existing backing track or no music. Instagram retains its existing manual publishing arrangement.

TikTok trending music cannot be attached through the current Buffer connection. Buffer supports some Reels music selection in its own composer, but Studio does not expose a platform library API picker. References:
- https://support.buffer.com/en-us/articles/using-tiktok-with-buffer-oGEroY9Of2
- https://support.buffer.com/en-us/articles/adding-music-stickers-and-other-effects-to-instagram-and-tiktok-posts-G5QrWfQL4k

Validation: `node --experimental-strip-types scripts/test-social-scenes.mjs` runs the actual handlers, receipt/checkpoint paths, image generation/edit request shapes with fixture responses, real three-slide ffmpeg exports, clean and AAC audio outputs, original excerpt validation and native-audio approval/provider fences. It makes no paid model requests and publishes nothing. Existing poster, save, publisher and background-queue regressions are also checked.
