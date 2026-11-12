"use client";

import { addBook, updateBook, updatePrices } from "@/app/actions/setup";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";

type Book = { id: number; title: string; sku: string; language: string; coverUrl: string | null; pricePaise: number; size: "big" | "small" };

export function BookForm({ book }: { book?: Book }) {
  const k = book?.id ?? "new";
  return (
    <ActionForm action={book ? updateBook : addBook} resetOnSuccess={!book}>
      {(s) => (
        <>
          {book && <input type="hidden" name="id" value={book.id} />}
          <Field label="Book name" htmlFor={`t-${k}`} error={s.fieldErrors?.title}>
            <input id={`t-${k}`} name="title" defaultValue={book?.title} className="field-input" placeholder="e.g. Bhagavad Gita As It Is" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Language" htmlFor={`l-${k}`} error={s.fieldErrors?.language}>
              <input id={`l-${k}`} name="language" defaultValue={book?.language ?? "English"} className="field-input" list="languages" />
            </Field>
            <Field label="Book Code" htmlFor={`c-${k}`} error={s.fieldErrors?.sku} tip="A short unique code to tell books apart, especially the same book in different languages. Example: BG-EN for the English Bhagavad Gita.">
              <input id={`c-${k}`} name="sku" defaultValue={book?.sku} className="field-input uppercase" placeholder="e.g. BG-EN" />
            </Field>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-ink-900">Book size</legend>
            <div className="grid grid-cols-2 gap-2">
              {([
                ["big", "📕 Big book", "e.g. Bhagavad Gita, Srimad Bhagavatam"],
                ["small", "📗 Small book", "e.g. Chant and Be Happy, booklets"],
              ] as const).map(([v, l, eg]) => (
                <label key={v} className="flex cursor-pointer flex-col rounded-xl border border-stone-300 bg-white px-3 py-2.5 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:ring-2 has-[:checked]:ring-brand-200">
                  <span className="flex items-center gap-2 font-semibold">
                    <input type="radio" name="size" value={v} defaultChecked={(book?.size ?? "small") === v} className="h-4 w-4 accent-brand-600" />
                    {l}
                  </span>
                  <span className="mt-0.5 text-xs text-ink-500">{eg}</span>
                </label>
              ))}
            </div>
            {s.fieldErrors?.size && <p className="mt-1 text-sm text-red-700">{s.fieldErrors.size}</p>}
            <p className="mt-1 text-xs text-ink-500">Used to count how many big and small books are distributed.</p>
          </fieldset>
          {!book && (
            <Field label="Price (₹)" htmlFor="price-new" error={s.fieldErrors?.price} help="The amount devotees collect for one copy.">
              <input id="price-new" name="price" inputMode="decimal" className="field-input" placeholder="e.g. 300" />
            </Field>
          )}
          <Field label="Cover picture link" htmlFor={`u-${k}`} optional help="Paste a web link to the cover image. Leave empty to show a coloured placeholder.">
            <input id={`u-${k}`} name="coverUrl" defaultValue={book?.coverUrl ?? ""} className="field-input" />
          </Field>
          <datalist id="languages">{["English", "Telugu", "Hindi", "Tamil", "Kannada", "Marathi", "Bengali", "Gujarati", "Odia", "Malayalam"].map((l) => <option key={l} value={l} />)}</datalist>
          <SubmitButton>{book ? "Save Changes" : "Add Book"}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function PricesForm({ books }: { books: Book[] }) {
  return (
    <ActionForm action={updatePrices} resetOnSuccess={false}>
      {(s) => (
        <>
          <ul className="divide-y divide-stone-100">
            {books.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                <label htmlFor={`price_${b.id}`} className="min-w-0 flex-1">
                  <span className="font-medium">{b.title}</span> <span className="text-sm text-ink-500">({b.language} · {b.sku})</span>
                  {s.fieldErrors?.[`price_${b.id}`] && <span className="block text-xs text-red-700">{s.fieldErrors[`price_${b.id}`]}</span>}
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-ink-500">₹</span>
                  <input id={`price_${b.id}`} name={`price_${b.id}`} inputMode="decimal" defaultValue={String(b.pricePaise / 100)} className="h-11 w-24 rounded-xl border border-stone-300 px-2 text-right font-semibold tabular-nums focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
                </div>
              </li>
            ))}
          </ul>
          <SubmitButton>Save New Prices</SubmitButton>
          <p className="text-xs text-ink-500">Changed prices apply to new sales. Past reports keep the price at which books were sold.</p>
        </>
      )}
    </ActionForm>
  );
}
