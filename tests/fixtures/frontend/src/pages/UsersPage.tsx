import React, { useEffect, useState } from "react";
import { fetchUsers } from "../api/users";
import UserCard from "../components/UserCard";

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  useEffect(() => {
    fetchUsers().then(setUsers);
  }, []);
  return (
    <div>
      <h1>Users</h1>
      {users.map((u: any) => (
        <UserCard key={u.id} user={u} />
      ))}
    </div>
  );
}
