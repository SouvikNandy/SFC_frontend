import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  readonly baseUrl = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  get<T>(_path: string) {
    return this.http.get<T>(`${this.baseUrl}${_path}`);
  }

  post<T, D>(_path: string, _body: D) {
    return this.http.post<T>(`${this.baseUrl}${_path}`, _body);
  }

  put<T, D>(_path: string, _body: D) {
    return this.http.put<T>(`${this.baseUrl}${_path}`, _body);
  }

  delete<T>(_path: string) {
    return this.http.delete<T>(`${this.baseUrl}${_path}`);
  }
}
