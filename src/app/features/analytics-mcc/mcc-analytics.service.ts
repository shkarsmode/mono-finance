
import { HttpClient, HttpParams } from '@angular/common/http';
import { Inject, inject, Injectable, signal } from '@angular/core';
import { BASE_PATH_API } from '@core/tokens/monobank-environment.tokens';

export interface MccRow {
  mcc: number;
  txCount: number;
  totalSpent: number;
  totalIncome: number;
  net: number;
  avgAbs: number;
  topMerchants: { name: string; total: number }[];
}
export interface MccResponse {
  params: { from?: string; to?: string; mccs?: number[] };
  totals: { totalSpent: number; totalIncome: number; net: number; txCount: number };
  rows: MccRow[];
}

@Injectable({ providedIn: 'root' })
export class MccAnalyticsService {
  private http = inject(HttpClient);
  @Inject(BASE_PATH_API) private readonly baseUrl: string = 'https://finance-back.vercel.app/api'
  private tokenGetter = () => localStorage.getItem('token') || '';

  loading = signal(false);
  last = signal<MccResponse | null>(null);

  async fetch(from?: string, to?: string, mccCsv?: string) {
    this.loading.set(true);
    try {
      let params = new HttpParams();
      if (from) params = params.set('from', from);
      if (to) params = params.set('to', to);
      if (mccCsv) params = params.set('mcc', mccCsv);

      const res = await this.http.get<MccResponse>(
        `${this.baseUrl}/analytics/mcc-table`,
        {
          params,
          headers: { Authorization: `Bearer ${this.tokenGetter()}` },
        }
      ).toPromise();
      if (res) this.last.set(res);
      return res;
    } finally {
      this.loading.set(false);
    }
  }
}
