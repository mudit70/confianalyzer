import React from "react";

export default function UserCard({ user }: { user: any }) {
  return (
    <div className="user-card">
      <span>{user.name}</span>
    </div>
  );
}
