export type Travel = {
    id: number;
    commercial_id: string;
    user_id?: number | null;
    status?: string;
    main_traveler?: {
        firstname?: string;
        lastname?: string;
        email?: string;
    };
    travel_detail?: string;
    departure_date?: string;
    pax_adults?: number;
    pax_kids?: number;
    budget?: number;
    is_deposit_paid?: boolean;
    created_at?: string;
    [key: string]: unknown;
};
export type User = {
    id: number;
    fullname: string;
    email?: string;
};
export type Quotation = {
    id: number | string;
    travel_name: string;
    price: number;
    is_validated?: boolean;
    active?: boolean;
    media_url?: string;
    expiration_date?: string;
};
export type Message = {
    id: number | string;
    message?: string;
    body?: string;
    content?: string;
    created_at?: string;
    consultant_id?: number;
    user_id?: number;
    [key: string]: unknown;
};
export type Event = {
    id: string;
    event_type: string;
    commercial_id: string | null;
    travel_id: number | null;
    payload: string;
    received_at: string;
    source: string;
};
export type Settings = {
    mode: 'demo' | 'live';
    baseUrl: string;
    apiToken?: string;
    webhookToken?: string;
};
export type ConfigView = {
    mode: 'demo' | 'live';
    baseUrl: string;
    hasApiToken: boolean;
    hasWebhookToken: boolean;
};

export type MessageTemplate = {
    id: number | string;
    name: string | Record<string, string>;
    title?: string | Record<string, string>;
    content: string | Record<string, string>;
};
