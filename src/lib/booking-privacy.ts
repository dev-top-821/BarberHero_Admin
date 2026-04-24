// Phone numbers are hidden on both sides until the booking reaches
// ON_THE_WAY (and remain visible through STARTED). Masked calling was
// deferred — see Docs/M3/06-masked-calling.md and the client note captured
// in Docs/M3/08-phone-visibility.md.

const PHONE_VISIBLE_STATUSES = new Set(["ON_THE_WAY", "STARTED"]);

export function phonesVisibleFor(status: string): boolean {
  return PHONE_VISIBLE_STATUSES.has(status);
}

export function redactPhonesByStatus<
  T extends {
    status: string;
    customer?: { phone?: string | null } | null;
    barber?: { user?: { phone?: string | null } | null } | null;
  },
>(booking: T): T {
  if (phonesVisibleFor(booking.status)) return booking;
  const next: T = { ...booking };
  if (next.customer) next.customer = { ...next.customer, phone: null };
  if (next.barber?.user) {
    next.barber = {
      ...next.barber,
      user: { ...next.barber.user, phone: null },
    };
  }
  return next;
}
