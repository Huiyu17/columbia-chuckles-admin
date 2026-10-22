export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  is_superadmin: boolean;
};

export type AdminUser = Profile & {
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
};

export type Img = {
  id: string;
  url: string;
  alt_text: string;
  user_id: string | null;
  created_at: string;
};

export type CaptionRow = {
  id: string;
  content: string;
  created_at: string;
  image_id: string;
  generation_id: string | null;
  admin_edited_at: string | null;
};

export type Vote = {
  user_id: string;
  caption_id: string;
  value: number;
  updated_at: string;
};

export type Generation = {
  id: string;
  user_id: string;
  image_id: string;
  model: string;
  prompt: string;
  user_input: string;
  created_at: string;
  generated_content: string | null;
  withdrawn_at: string | null;
};

export type Dataset = {
  profiles: Profile[];
  images: Img[];
  captions: CaptionRow[];
  votes: Vote[];
  generations: Generation[];
};
