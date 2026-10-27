export interface MeTubeOption {
  id: string;
  text: string;
}

export interface MeTubeChoice<T extends MeTubeOption = MeTubeOption> {
  default: string;
  options: T[];
}

export interface MeTubeFormatOption extends MeTubeOption {
  quality?: MeTubeChoice;
}

export interface MeTubeDownloadType extends MeTubeOption {
  format: MeTubeChoice<MeTubeFormatOption>;
  codec?: MeTubeChoice;
}

export interface MeTubeFormatCatalog {
  download_type: MeTubeChoice<MeTubeDownloadType>;
}

export interface MeTubeDownload {
  id?: string;
  title?: string;
  url: string;
  download_type?: string;
  codec?: string;
  format?: string;
  quality?: string;
  status: string;
  msg?: string;
  percent?: number;
  speed?: number;
  eta?: number;
  filename?: string;
  size?: number;
  timestamp?: number;
}

export interface MeTubeHistory {
  queue: MeTubeDownload[];
  done: MeTubeDownload[];
}

export interface AddDownloadPayload {
  url: string;
  download_type: string;
  codec: string;
  format: string;
  quality: string;
  auto_start: boolean;
}
