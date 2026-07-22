   {activeTab === "bible" && (
          <section className="flex-1 px-5 py-8">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-500">
                Story Bible
              </p>

              <h2 className="mt-2 text-2xl font-semibold">
                {bibleHasContent
                  ? "Story details"
                  : "No story details yet"}
              </h2>

              {!bibleHasContent ? (
                <p className="mt-3 max-w-2xl leading-7 text-neutral-400">
                  Characters, setting, tropes,
                  plot decisions and series
                  information will be built
                  automatically from your
                  conversation.
                </p>
              ) : (
                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  {storyBible.premise && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5 md:col-span-2">
                      <h3 className="text-sm font-semibold text-pink-500">
                        Premise
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap leading-7 text-neutral-300">
                        {storyBible.premise}
                      </p>
                    </div>
                  )}

                  {storyBible.relationship && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5">
                      <h3 className="text-sm font-semibold text-pink-500">
                        Relationship
                      </h3>
                      <p className="mt-2 leading-7 text-neutral-300">
                        {
                          storyBible.relationship
                        }
                      </p>
                    </div>
                  )}

                  {storyBible.subgenre && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5">
                      <h3 className="text-sm font-semibold text-pink-500">
                        Subgenre
                      </h3>
                      <p className="mt-2 leading-7 text-neutral-300">
                        {storyBible.subgenre}
                      </p>
                    </div>
                  )}

                  {storyBible.setting && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5">
                      <h3 className="text-sm font-semibold text-pink-500">
                        Setting
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap leading-7 text-neutral-300">
                        {storyBible.setting}
                      </p>
                    </div>
                  )}

                  {storyBible.pov && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5">
                      <h3 className="text-sm font-semibold text-pink-500">
                        POV
                      </h3>
                      <p className="mt-2 leading-7 text-neutral-300">
                        {storyBible.pov}
                      </p>
                    </div>
                  )}

                  {storyBible.heatLevel && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5">
                      <h3 className="text-sm font-semibold text-pink-500">
                        Heat Level
                      </h3>
                      <p className="mt-2 leading-7 text-neutral-300">
                        {storyBible.heatLevel}
                      </p>
                    </div>
                  )}

                  {storyBible.burnPacing && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5">
                      <h3 className="text-sm font-semibold text-pink-500">
                        Burn Pacing
                      </h3>
                      <p className="mt-2 leading-7 text-neutral-300">
                        {storyBible.burnPacing}
                      </p>
                    </div>
                  )}

                  {storyBible.tropes.length >
                    0 && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5 md:col-span-2">
                      <h3 className="text-sm font-semibold text-pink-500">
                        Tropes
                      </h3>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {storyBible.tropes.map(
                          (trope) => (
                            <span
                              key={trope}
                              className="rounded-full border border-pink-500/20 bg-pink-500/10 px-3 py-1 text-sm text-pink-300"
                            >
                              {trope}
                            </span>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {storyBible.characters
                    .length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5 md:col-span-2">
                      <h3 className="text-sm font-semibold text-pink-500">
                        Characters
                      </h3>
                      <div className="mt-3 space-y-3">
                        {storyBible.characters.map(
                          (character) => (
                            <p
                              key={character}
                              className="rounded-lg border border-white/5 bg-white/5 px-4 py-3 leading-7 text-neutral-300"
                            >
                              {character}
                            </p>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {storyBible.notes.length >
                    0 && (
                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-5 md:col-span-2">
                      <h3 className="text-sm font-semibold text-pink-500">
                        Notes
                      </h3>
                      <ul className="mt-3 space-y-3">
                        {storyBible.notes.map(
                          (note) => (
                            <li
                              key={note}
                              className="rounded-lg border border-white/5 bg-white/5 px-4 py-3 leading-7 text-neutral-300"
                            >
                              {note}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

