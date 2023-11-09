"use server";

import { FilterQuery, SortOrder } from "mongoose";

import Community from "../models/community.model";
import User from "../models/user.model";
import Thread from "../models/thread.model";

import { connectToDB } from "../mongoose";

export async function createCommunity(
  id: string,
  name: string,
  username: string,
  image: string,
  bio: string,
  createdById: string // Change the parameter name to reflect it's an id
) {
  try {
    connectToDB();

    // Find the user with the provided unique id
    const user = await User.findOne({ id: createdById });

    if (!user) {
      throw new Error("User not found"); // Handle the case if the user with that id is not found
    }

    const newCommunity = new Community({
      id,
      name,
      username,
      image,
      bio,
      createdBy: user._id, // Use the mongoose ID of the user
    });

    const createdCommunity = await newCommunity.save();

    // update user model
    user.communities.push(createdCommunity._id);
    await user.save();

    return createdCommunity;
  } catch (error: any) {
    throw new Error(`Failed creating community ${error.message}`);
  }
}

export async function addMemberToCommunity(
  communityId: string,
  memberId: string
) {
  try {
    connectToDB();

    // Find the community by its unique id;
    const community = await Community.findOne({ id: communityId });

    if (!community) {
      throw new Error("Community not found");
    }

    // Find the user by its unique id;
    const user = await User.findOne({ id: memberId });

    if (!user) {
      throw new Error("User not found");
    }

    if (community.members.includes(user._id)) {
      throw new Error("User is already a member of the community");
    }

    // Add the user's _id to the members array in the community
    community.members.push(user._id);
    await community.save();

    // Add the community's _id to the communities array in the user
    user.communities.push(community._id);
    await user.save();

    return community;
  } catch (error: any) {
    throw new Error(`Failed add member to community: ${error.message}`);
  }
}

export async function removeUserFromCommunity(
  userId: string,
  communityId: string
) {
  try {
    connectToDB();

    // { _id: 1 } specifies the fields to be returned in the result. In this case, only the _id field will be included in the returned object.
    const userIdObject = await User.findOne({ id: userId }, { _id: 1 });
    const communityIdObject = await Community.findOne(
      { id: communityId },
      { _id: 1 }
    );

    if (!userIdObject) {
      throw new Error("user not found");
    }

    if (!communityIdObject) {
      throw new Error("community not found");
    }

    // Remove the user's _id from the members array in the community
    Community.updateOne(
      { _id: communityIdObject._id },
      { $pull: { members: userIdObject._id } }
    );

    // Remove the community's _id from the communities array in the user
    User.updateOne(
      { _id: userIdObject._id },
      { $pull: { communities: communityIdObject._id } }
    );

    return { success: true };
  } catch (error: any) {
    throw new Error(`Failed remove user from community: ${error.message}`);
  }
}

export async function updateCommunityInfo(
  communityId: string,
  name: string,
  username: string,
  image: string
) {
  try {
    connectToDB();

    // Find the community by its id and update the information
    const updatedCommunity = await Community.findByIdAndUpdate(
      {
        id: communityId,
      },
      {
        name,
        username,
        image,
      }
    );

    if (!updatedCommunity) {
      throw new Error("Community not found");
    }

    return updatedCommunity;
  } catch (error: any) {
    throw new Error(`Failed to update community info: ${error.message}`);
  }
}

export async function deleteCommunity(communityId: string) {
  try {
    connectToDB();

    // Find the community bt its ID and delete it
    const deletedCommunity = await Community.findOneAndDelete({
      id: communityId,
    });

    // delete all threads associated with the community
    await Thread.deleteMany({ community: communityId });

    // find all users who are part of the community
    const communityUsers = await User.find({ communities: communityId });

    // remove the community from the 'communities' array for each user
    const updateUserPromise = communityUsers.map((user) => {
      user.communities.pull(communityId);
      return user.save();
    });

    await Promise.all(updateUserPromise);

    return deletedCommunity;
  } catch (error: any) {
    throw new Error(`Failed to delete community: ${error.message}`);
  }
}

export async function fetchCommunityDetails(id: string) {
  try {
    connectToDB();

    const communityDetails = await Community.findOne({ id })
      .populate({
        path: "createdBy",
        model: User,
      })
      .populate({
        path: "members",
        model: User,
        select: `name username image _id id`,
      });

    return communityDetails;
  } catch (error: any) {
    throw new Error(`Failed to fetch community details: ${error.message}`);
  }
}

export async function fetchCommunityPosts(id: string) {
  try {
    connectToDB();

    const communityPosts = await Community.findById(id).populate({
      path: "threads",
      model: Thread,
      populate: [
        {
          path: "author",
          model: User,
          select: `name image id`,
        },
        {
          path: "children",
          model: Thread,
          populate: {
            path: "author",
            model: User,
            select: `image id`,
          },
        },
      ],
    });

    return communityPosts;
  } catch (error: any) {
    throw new Error(`Failed to fetch community posts: ${error.message}`);
  }
}

export async function fetchCommunities({
  searchString = "",
  pageNumber = 1,
  pageSize = 20,
  sortBy = "desc",
}: {
  searchString?: string;
  pageNumber?: number;
  pageSize?: number;
  sortBy?: SortOrder;
}) {
  try {
    connectToDB();

    // Calculate the number of communties to skip based on the page number and page size.
    const skipAmount = (pageNumber - 1) * pageSize;

    // Create a case-insensitive regular expression for the provided search string.
    const regex = new RegExp(searchString, "i");

    //  Create an initial query object to filter communities.
    const query: FilterQuery<typeof Community> = {};

    // If the seach string is not empt, add the $or operator to match either username or name fields.
    if (searchString.trim() !== "") {
      query.$or = [
        { username: { $regex: regex } },
        { name: { $regex: regex } },
      ];
    }

    // Define the sort options for the fetched communities based on createdAt field and provided sort order.
    const sortOptions = { createdAt: sortBy };

    // Create a query to fetch the communities based on the search and sort criteria.
    const communitiesQuery = Community.find(query)
      .sort(sortOptions)
      .skip(skipAmount)
      .limit(pageSize)
      .populate({
        path: "members",
        model: User,
      });

    // Count the total number of communities that match the search criteria (without pagination)
    const totalCommunitiesCount = await Community.countDocuments(query);

    const communities = await communitiesQuery.exec();

    // Check if there are more communities beyond the current page.
    const isNext = totalCommunitiesCount > skipAmount + communities.length;

    return { communities, isNext };
  } catch (error: any) {
    throw new Error(`Failed to fetch communities: ${error.message}`);
  }
}
