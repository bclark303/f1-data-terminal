export type Session = {
  circuit_key: number;
  circuit_short_name: string;
  country_code: string;
  country_name: string;
  date_end: string;
  date_start: string;
  gmt_offset: string;
  location: string;
  meeting_key: number;
  session_key: number;
  session_name: string;
  session_type: string;
  year: number;
};

export type Driver = {
  driver_number: number;
  full_name: string;
  name_acronym: string;
  team_colour: string;
  team_name: string;
  session_key: number;
};

export type Weather = {
  air_temperature: number | null;
  date: string;
  humidity: number | null;
  pressure: number | null;
  rainfall: number | null;
  track_temperature: number | null;
  wind_direction: number | null;
  wind_speed: number | null;
};

export type RaceControlMessage = {
  category: string;
  date: string;
  driver_number: number | null;
  flag: string | null;
  lap_number: number | null;
  message: string;
  scope: string | null;
  sector: number | null;
};

export type PositionPoint = {
  date: string;
  driver_number: number;
  position: number;
};

export type IntervalPoint = {
  date: string;
  driver_number: number;
  gap_to_leader: number | string | null;
  interval: number | string | null;
};

export type Lap = {
  date_start: string | null;
  driver_number: number;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  lap_duration: number | null;
  lap_number: number;
  is_pit_out_lap: boolean;
};

export type Stint = {
  compound: string;
  driver_number: number;
  lap_end: number | null;
  lap_start: number;
  stint_number: number;
  tyre_age_at_start: number;
};

export type LocationPoint = {
  date: string;
  driver_number: number;
  x: number;
  y: number;
  z: number | null;
};

export type CarDataPoint = {
  brake: number | null;
  date: string;
  driver_number: number;
  drs: number | null;
  n_gear: number | null;
  rpm: number | null;
  speed: number | null;
  throttle: number | null;
};
