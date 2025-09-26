import { useEffect, useState } from "react";
import { useAuthValue } from '../Firebase/AuthContext';

export function useUID() {
  const { currentUser } = useAuthValue();
  return currentUser?.uid || null;
}