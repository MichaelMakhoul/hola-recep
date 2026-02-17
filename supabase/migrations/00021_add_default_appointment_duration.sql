ALTER TABLE public.organizations
  ADD COLUMN default_appointment_duration INTEGER NOT NULL DEFAULT 30;
