export interface UserModel {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
}
