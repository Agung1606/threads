"use server";

import { revalidatePath } from "next/cache";
import User from "../models/user.model";
import { connectToDB } from "../mongoose";

interface UpdateUserParams {
  userId: string;
  username: string;
  name: string;
  bio: string;
  image: string;
  path: string;
}

export async function updateUser({
  userId,
  username,
  name,
  bio,
  image,
  path,
}: UpdateUserParams): Promise<void> {
  connectToDB();
  try {
    await User.findOneAndUpdate(
      { id: userId },
      {
        username: username.toLowerCase(),
        name,
        bio,
        image,
        onboarded: true,
      },
      /*
    update and instert (upsert) is a database operation that will update an existing row if a specified value already exists in a table,
    and insert a new row if the specified value doesn't exist.
    */
      { upsert: true }
    );

    if (path === "/profile/edit") {
      /*
      revalidatePath allows you to revalidate data associated with a specific path.
      this is useful for scenario where you wanna update your cached data without
      waiting for revalidation period to expire.
    */
      revalidatePath(path);
    }
  } catch (error: any) {
    throw new Error(`Failed to create/update user: ${error.message}`);
  }
}

export async function fetchUser(userId: string) {
  connectToDB();
  try {
    const user = await User.findOne({ id: userId });
    // .populate({
    //   path: "communities",
    //   model: Community,
    // });

    if (!user) {
      throw new Error(`User not found`);
    }

    return user;
  } catch (error: any) {
    throw new Error(`Failed to fetch user: ${error.message}`);
  }
}
