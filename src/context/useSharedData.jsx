import { useContext } from "react";
import { SharedDataContext } from "./SharedDataContext.jsx";

export const useSharedData = () => useContext(SharedDataContext);

