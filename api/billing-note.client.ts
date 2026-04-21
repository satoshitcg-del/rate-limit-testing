/**
 * Billing Note API Client
 * Handles billing-note related endpoints
 */

import { getApiBaseUrl } from '../config/env';

export interface BillingNoteQuery {
  status?: string;
  page?: number;
  limit?: number;
}

export class BillingNoteClient {
  private baseURL: string;

  constructor(baseURL?: string) {
    this.baseURL = baseURL || getApiBaseUrl();
  }

  async getCustomerList(token: string, query: BillingNoteQuery = {}): Promise<any> {
    const params = new URLSearchParams();
    if (query.status) params.append('status', query.status);
    if (query.page) params.append('page', query.page.toString());
    if (query.limit) params.append('limit', query.limit.toString());

    const response = await fetch(`${this.baseURL}/v1/md/billing-note/customer?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    return response.json();
  }

  async getCustomerExportAll(token: string, status: string): Promise<any> {
    const response = await fetch(`${this.baseURL}/v1/md/billing-note/customer-export-all/${status}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    return response.json();
  }

  async getCustomerExport(token: string, id: string): Promise<any> {
    const response = await fetch(`${this.baseURL}/v1/md/billing-note/customer-export/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    return response.json();
  }

  async getPreview(token: string, id: string): Promise<any> {
    const response = await fetch(`${this.baseURL}/v1/md/billing-note/preview/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    return response.json();
  }

  async getInvoice(token: string, id: string): Promise<any> {
    const response = await fetch(`${this.baseURL}/v1/md/billing-note/customer/invoice/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    return response.json();
  }

  async getV2CustomerList(token: string, query: BillingNoteQuery = {}): Promise<any> {
    const params = new URLSearchParams();
    if (query.status) params.append('status', query.status);
    if (query.page) params.append('page', query.page.toString());
    if (query.limit) params.append('limit', query.limit.toString());

    const response = await fetch(`${this.baseURL}/v2/md/billing-note/customer?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    return response.json();
  }

  async paymentVerify(token: string, invoiceId: string, amount: number): Promise<any> {
    const response = await fetch(`${this.baseURL}/v1/md/billing-note/payment/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({ invoice_id: invoiceId, amount }),
    });

    return response.json();
  }
}

export const billingNoteClient = new BillingNoteClient();