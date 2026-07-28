export interface ServiceType {
  id: string;
  resourceId: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

export interface Slot {
  startAt: string;
  endAt: string;
}

export interface Availability {
  resourceId: string;
  timezone: string;
  slots: Slot[];
}

export interface Booking {
  id: string;
  tenantId: string;
  resourceId: string;
  serviceTypeId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  startAt: string;
  endAt: string;
  status: string;
  holdExpiresAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ListServiceTypesInput {
  resourceId?: string;
}

export interface GetAvailabilityInput {
  /** YYYY-MM-DD */
  from: string;
  /** YYYY-MM-DD */
  to: string;
  resourceId?: string;
  serviceTypeId?: string;
}

export interface CreateBookingInput {
  /** ISO 8601, e.g. from a Slot's startAt. */
  startAt: string;
  customerName: string;
  customerEmail: string;
  resourceId?: string;
  serviceTypeId?: string;
  customerPhone?: string;
  notes?: string;
  lang?: string;
  turnstileToken?: string;
}
