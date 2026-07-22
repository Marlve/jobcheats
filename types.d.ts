type Statistics = {
  cpuUsage: number,
  ramUsage: number,
  storageUsage: number,
};

type StaticData = {
  totalStorage: {
    total: number,

  },
  cpuModel: String,
  totalMemoryGB: number;
};

interface Window {
  electron: {
    subscribeStatistics: (callback: (statistics: Statistics) => void) => void;

    getStaticData: ()=> Promise<StaticData>;

    openLinkedIn: () => Promise<void>;

    openSeek: () => Promise<void>;

    scrapeLinkedIn: () => Promise<void>;
  }
}

interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

interface StorageState {
  cookies: PlaywrightCookie[];
  origins: {
    origin: string;
    localStorage: {
      name: string;
      value: string
    }[]
  }[];
}
