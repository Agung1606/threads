"use server";

import { revalidatePath } from "next/cache";
import Thread from "../models/thread.model";
import User from "../models/user.model";
import { connectToDB } from "../mongoose";

interface CreateThreadParams {
  text: string;
  author: string;
  communityId: string | null;
  path: string;
}

interface AddCommentToThreadParams {
  threadId: string;
  commentText: string;
  userId: string;
  path: string;
}

export async function createThread({
  text,
  author,
  communityId,
  path,
}: CreateThreadParams) {
  try {
    connectToDB();

    const newThread = await Thread.create({
      text,
      author,
      community: null,
    });

    // update user model
    await User.findByIdAndUpdate(author, {
      $push: { threads: newThread._id },
    });

    revalidatePath(path); // to make changes happen immediately
  } catch (error: any) {
    throw new Error(`Failed to create new thread ${error.message}`);
  }
}

export async function fetchPosts(pageNumber = 1, pageSize = 20) {
  try {
    connectToDB();

    // calculate the number of posts to skip
    const skipAmount = (pageNumber - 1) * pageSize;

    // fetch the posts that have no parents (top level threads...)
    const postsQuery = Thread.find({
      parentId: { $in: [null, undefined] },
    })
      .sort({ createdAt: "desc" })
      .skip(skipAmount)
      .limit(pageSize)
      .populate({ path: "author", model: User })
      .populate({
        path: "children",
        populate: {
          path: "author",
          model: User,
          select: "_id name parentId image",
        },
      });

    // to know the total of threads in database
    const totalPostsCount = await Thread.countDocuments({
      parentId: { $in: [null, undefined] },
    });

    const posts = await postsQuery.exec(); // execute the postsQuery
    const isNext = totalPostsCount > skipAmount + posts.length;

    return { posts, isNext };
  } catch (error: any) {
    throw new Error(`Failed to fetch posts ${error.message}`);
  }
}

export async function fetchThreadById(id: string) {
  try {
    connectToDB();

    // TODO: populate community
    const thread = await Thread.findById(id)
      .populate({
        path: "author",
        model: User,
        select: `_id id name image`,
      })
      .populate({
        path: "children",
        populate: [
          {
            path: "author",
            model: User,
            select: `_id id name parentId image`,
          },
          {
            path: "children",
            model: Thread,
            populate: {
              path: "author",
              model: User,
              select: `_id id name parentId image`,
            },
          },
        ],
      })
      .exec();

    return thread;
  } catch (error: any) {
    throw new Error(`Error fetching thread: ${error.message}`);
  }
}

export async function addCommentToThread({
  threadId,
  commentText,
  userId,
  path,
}: AddCommentToThreadParams) {
  try {
    connectToDB();

    // find the original thread by its ID
    const originalThread = await Thread.findById(threadId);

    if (!originalThread) {
      throw new Error(`Thread not found`);
    }

    // create a new thread with the comment text
    const commentThread = new Thread({
      text: commentText,
      author: userId,
      parentId: threadId,
    });

    // save the new thread
    const savedCommentThread = await commentThread.save();

    // update the original thread to include the new comment
    originalThread.children.push(savedCommentThread._id);

    // save orinal thread
    await originalThread.save();

    revalidatePath(path);
  } catch (error: any) {
    throw new Error(`error adding comment to thread ${error.message}`);
  }
}
