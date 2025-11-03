export type ConsumptionEvent = {
  timestamp: number; // ms since epoch
  weightGrams: number; // grams
  thcPercent: number; // 0-100
  method: string; // e.g., joint, vape
  notes?: string;
};

export type SessionContext = {
  place?: string;
  weather?: string;
  noise?: string;
  light?: string;
  music?: string;
  activity?: string;
};

export type SocialContext = {
  numPeopleSharing?: number; // includes user
};

export type UserState = {
  lastMeal?: string;
  mood?: string;
  intention?: string;
};

export type GeoLocation = {
  lat: number;
  lon: number;
};

export type Session = {
  id: string;
  startTime: number;
  endTime?: number;
  active: boolean;
  geo?: GeoLocation;
  timeOfDay?: 'Morning' | 'Afternoon' | 'Evening' | 'Night';
  baseSubstance?: {
    type?: string;
  };
  context: SessionContext;
  social: SocialContext;
  user: UserState;
  supplements: string[];
  effects: string[];
  notes?: string;
  consumptions: ConsumptionEvent[];
};

export type AppData = {
  sessions: Session[];
  createdAt: number;
  version: 1;
};
