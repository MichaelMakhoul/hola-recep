ALTER TABLE public.organizations
  ADD CONSTRAINT check_appointment_duration
  CHECK (default_appointment_duration >= 5 AND default_appointment_duration <= 480);
