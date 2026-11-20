import type { StudioBook } from "./social-creative-directions";
export async function studioBook(slug: string): Promise<StudioBook> {
  const response = await fetch("https://www.marlowquinn.com/api/books", {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw Error("Your verified book catalogue could not be loaded.");
  const catalogue = await response.json();
  const book = catalogue.books?.find((b: StudioBook) => b.slug === slug);
  if (!book?.title || !book.blurb || !book.coverUrl || !book.amazonUrl)
    throw Error("Choose a book from the current catalogue.");
  return book;
}
