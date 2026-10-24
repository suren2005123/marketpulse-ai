declare module 'upstox-js-sdk' {
  export class ApiClient {
    static instance: ApiClient;
    basePath: string;
    authentications: {
      OAUTH2: {
        type: string;
        accessToken?: string;
      };
      [key: string]: any;
    };
    callApi(
      path: string,
      httpMethod: string,
      pathParams: any,
      queryParams: any,
      headerParams: any,
      formParams: any,
      postBody: any,
      authNames: string[],
      contentTypes: string[],
      accepts: string[],
      returnType: any,
      callback?: (error: any, data: any, response: any) => void
    ): any;
  }

  export class LoginApi {
    constructor(apiClient?: ApiClient);
    authorize(
      apiVersion: string,
      clientId: string,
      redirectUri: string,
      responseType: string,
      opts?: any,
      callback?: (error: any, data: any, response: any) => void
    ): any;
    token(
      apiVersion: string,
      opts: {
        code: string;
        clientId: string;
        clientSecret: string;
        redirectUri: string;
        grantType: string;
      },
      callback?: (error: any, data: any, response: any) => void
    ): any;
  }

  export class MarketDataStreamerV3 {
    constructor(instrumentKeys?: string[], mode?: string);
    Event: {
      OPEN: string;
      CLOSE: string;
      MESSAGE: string;
      ERROR: string;
      RECONNECTING: string;
      AUTO_RECONNECT_STOPPED: string;
    };
    Mode: {
      LTPC: string;
      FULL: string;
      OPTION: string;
      D30: string;
    };
    connect(): Promise<void>;
    disconnect(): void;
    subscribe(instrumentKeys: string[], mode?: string): void;
    unsubscribe(instrumentKeys: string[]): void;
    changeMode(instrumentKeys: string[], newMode: string): void;
    autoReconnect(enable: boolean, interval?: number, retryCount?: number): void;
    on(event: string, listener: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): boolean;
  }

  const defaultExport: Record<string, any>;
  export default defaultExport;
}
