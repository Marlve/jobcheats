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
    getStaticData: ()=> Promise<StaticData>
  }
}
