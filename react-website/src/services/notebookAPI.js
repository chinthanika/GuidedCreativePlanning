import { transformProfileData } from "../utils/transformData";

export async function getNotebookData(uid) {
    console.log("Fetching notebook data for UID:", uid);
    if (!uid) {
        throw new Error("User ID is required to fetch notebook data.");
    }
    const res = await fetch(
        `http://localhost:5001/api/profile?userId=${encodeURIComponent(uid)}`,
        {
            method: "GET",
        });

    if (!res.ok) {
        throw new Error(`Failed to fetch profile: ${res.status}`);
    }
    const data = await res.json(); // actually parse JSON
    
    const transformedData = transformProfileData(data); // transform the raw data
    console.log("Transformed data:", transformedData); // 👈 now you'll see real data
    return transformedData;
}
