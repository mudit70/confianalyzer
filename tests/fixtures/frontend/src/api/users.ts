import apiClient from "./client";

export async function fetchUsers(): Promise<any[]> {
  const response = await apiClient.get("/api/users");
  return response.data;
}

export async function createUser(userData: any): Promise<any> {
  const response = await apiClient.post("/api/users", userData);
  return response.data;
}
