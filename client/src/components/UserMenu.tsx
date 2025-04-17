interface UserMenuProps {
  userName: string;
}

export default function UserMenu({ userName }: UserMenuProps) {
  return (
    <div className="flex items-center space-x-2">
      <span className="text-[9pt] text-neutral-400">{userName}</span>
      <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center text-[9pt]">
        {userName.charAt(0).toUpperCase()}
      </div>
    </div>
  );
}
