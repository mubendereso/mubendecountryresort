import { getRooms } from "@/lib/rooms/data";
import BookForm from "./book-form";

export const dynamic = "force-dynamic";

export default async function BookPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { room } = await searchParams;
  const initialSlug = Array.isArray(room) ? room[0] : room;

  const roomTypes = await getRooms();

  return (
    <section className="section-space">
      <div className="section-shell max-w-2xl">
        <p className="text-xs uppercase tracking-[0.2em] text-oliveMuted-500">Make a Reservation</p>
        <h1 className="mt-2 font-heading text-4xl sm:text-5xl">Book Your Stay</h1>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
          Complete the form below to reserve your room. You will be redirected to Pesapal to
          complete payment securely.
        </p>

        {roomTypes.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-500">
            No rooms are currently available for booking. Please contact us directly.
          </p>
        ) : (
          <BookForm roomTypes={roomTypes} initialSlug={initialSlug} />
        )}
      </div>
    </section>
  );
}
