import { ID, ImageGravity, Query } from "appwrite";

import { appwriteConfig, account, databases, storage, avatars } from "./config";
import { IUpdatePost, INewPost, INewUser, IUpdateUser } from "@/types";


export async function createUserAccount(user: INewUser) {
  try {
    const newAccount = await account.create(
      ID.unique(),
      user.email,
      user.password,
      user.name
    );

    if (!newAccount) throw Error;

    const avatarUrl = avatars.getInitials(user.name);

    const newUser = await saveUserToDB({
      accountId: newAccount.$id,
      name: newAccount.name,
      email: newAccount.email,
      username: user.username,
      imageUrl: avatarUrl,
    });

    return newUser;
  } catch (error) {
    console.log(error);
    return error;
  }
}

export async function signInAccount(user: { email: string; password: string }) {
  try {
    const session = await account.createEmailPasswordSession(user.email, user.password);

    return session;
  } catch (error) {
    console.log(error);
  }
}


export async function saveUserToDB(user: {
  accountId: string;
  email: string;
  name: string;
  imageUrl: URL;
  username?: string;
}) {
  try {
    const newUser = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      ID.unique(),
      user,
    );

    return newUser;
  } catch (error) {
    console.log(error);
  }
}


export async function getAccount() {
  try {
    const currentAccount = await account.get();

    return currentAccount;
  } catch (error) {
    console.log(error);
  }
}

// ============================== GET USER
export async function getCurrentUser() {
  try {
    const currentAccount = await getAccount();

    if (!currentAccount) throw Error;

    const currentUser = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      [Query.equal("accountId", currentAccount.$id)]
    );

    if (!currentUser) throw Error;

    return currentUser.documents[0];
  } catch (error) {
    console.log(error);
    return null;
  }
}

// ============================== SIGN OUT
export async function signOutAccount() {
  try {
    const session = await account.deleteSession("current");

    return session;
  } catch (error) {
    console.log(error);
  }
}

// ============================================================
// POSTS
// ============================================================

// ============================== CREATE POST
export async function createPost(post: INewPost) {
  try {
    // Upload file to appwrite storage
    const uploadedFile = await uploadFile(post.file[0]);

    if (!uploadedFile) throw Error;

    //Get file url
    const fileUrl = getFilePreview(uploadedFile.$id);
    if (!fileUrl) {
      await deleteFile(uploadedFile.$id);
      throw Error;
    }

    // Convert tags into array
    const tags = post.tags?.replace(/ /g, "").split(",") || [];

    // Create post
    const newPost = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.postCollectionId,
      ID.unique(),
      {
        creator: post.userId,
        caption: post.caption,
        imageUrl: fileUrl,
        imageId: uploadedFile.$id,
        location: post.location,
        tags: tags,
      }
    );

    if (!newPost) {
      await deleteFile(uploadedFile.$id);
      throw Error;
    }

    return newPost;
  } catch (error) {
    console.log(error);
  }
}

// ============================== UPLOAD FILE
export async function uploadFile(file: File) {
  try {
    const uploadedFile = await storage.createFile(
      appwriteConfig.storageId,
      ID.unique(),
      file
    );

    return uploadedFile;
  } catch (error) {
    console.log(error);
  }
}

// ============================== GET FILE URL
export function getFilePreview(fileId: string) {
  try {
    const fileUrl = storage.getFilePreview(
      appwriteConfig.storageId,
      fileId,
      2000,
      2000,
      ImageGravity.Top,
      100
    );

    if (!fileUrl) throw Error;

    return fileUrl;
  } catch (error) {
    console.log(error);
  }
}

// ============================== DELETE FILE
export async function deleteFile(fileId: string) {
  try {
    await storage.deleteFile(appwriteConfig.storageId, fileId);

    return { status: "ok" };
  } catch (error) {
    console.log(error);
  }
}

// ============================== GET POSTS
export async function searchPosts(searchTerm: string) {
  try {
    const posts = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.postCollectionId,
      [Query.search("caption", searchTerm)]
    );

    if (!posts) throw Error;

    return posts;
  } catch (error) {
    console.log(error);
  }
}

export async function getInfinitePosts({ pageParam }: { pageParam: number }) {
  const queries: any[] = [Query.orderDesc("$updatedAt"), Query.limit(9)];

  if (pageParam) {
    queries.push(Query.cursorAfter(pageParam.toString()));
  }

  try {
    const posts = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.postCollectionId,
      queries
    );

    if (!posts) throw Error;

    return posts;
  } catch (error) {
    console.log(error);
  }
}

// ============================== GET POST BY ID
export async function getPostById(postId?: string) {
  if (!postId) throw Error;

  try {
    const post = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.postCollectionId,
      postId
    );

    if (!post) throw Error;

    return post;
  } catch (error) {
    console.log(error);
  }
}

// ============================== UPDATE POST
export async function updatePost(post: IUpdatePost) {
  const hasFileToUpdate = post.file.length > 0;

  try {
    let image = {
      imageUrl: post.imageUrl,
      imageId: post.imageId,
    };

    if (hasFileToUpdate) {
      // Upload new file to appwrite storage
      const uploadedFile = await uploadFile(post.file[0]);
      if (!uploadedFile) throw Error;

      //Get new file url
      const fileUrl = getFilePreview(uploadedFile.$id);
      if (!fileUrl) {
        await deleteFile(uploadedFile.$id);
        throw Error;
      }

      image = { ...image, imageUrl: fileUrl, imageId: uploadedFile.$id };
    }

    // Convert tags into array
    const tags = post.tags?.replace(/ /g, "").split(",") || [];

    //  Update post
    const updatedPost = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.postCollectionId,
      post.postId,
      {
        caption: post.caption,
        imageUrl: image.imageUrl,
        imageId: image.imageId,
        location: post.location,
        tags: tags,
      }
    );

    // Failed to update
    if (!updatedPost) {
      // Delete new file that has been recently uploaded
      if (hasFileToUpdate) {
        await deleteFile(image.imageId);
      }

      // If no new file uploaded, just throw error
      throw Error;
    }

    // Safely delete old file after successful update
    if (hasFileToUpdate) {
      await deleteFile(post.imageId);
    }

    return updatedPost;
  } catch (error) {
    console.log(error);
  }
}

// ============================== DELETE POST
export async function deletePost(postId?: string, imageId?: string) {
  if (!postId || !imageId) return;

  try {
    const statusCode = await databases.deleteDocument(
      appwriteConfig.databaseId,
      appwriteConfig.postCollectionId,
      postId
    );

    if (!statusCode) throw Error;

    await deleteFile(imageId);

    return { status: "Ok" };
  } catch (error) {
    console.log(error);
  }
}

// ============================== LIKE / UNLIKE POST
export async function likePost(postId: string, likesArray: string[]) {
  try {
    const updatedPost = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.postCollectionId,
      postId,
      {
        likes: likesArray,
      }
    );

    if (!updatedPost) throw Error;

    return updatedPost;
  } catch (error) {
    console.log(error);
  }
}

// ============================== SAVE POST
export async function savePost(userId: string, postId: string) {
  try {
    const updatedPost = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.savesCollectionId,
      ID.unique(),
      {
        user: userId,
        post: postId,
      }
    );

    if (!updatedPost) throw Error;

    return updatedPost;
  } catch (error) {
    console.log(error);
  }
}
// ============================== DELETE SAVED POST
export async function deleteSavedPost(savedRecordId: string) {
  try {
    const statusCode = await databases.deleteDocument(
      appwriteConfig.databaseId,
      appwriteConfig.savesCollectionId,
      savedRecordId
    );

    if (!statusCode) throw Error;

    return { status: "Ok" };
  } catch (error) {
    console.log(error);
  }
}

// ============================== GET USER'S POST
export async function getUserPosts(userId?: string) {
  if (!userId) return;

  try {
    const post = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.postCollectionId,
      [Query.equal("creator", userId), Query.orderDesc("$createdAt")]
    );

    if (!post) throw Error;

    return post;
  } catch (error) {
    console.log(error);
  }
}

// ============================== GET POPULAR POSTS (BY HIGHEST LIKE COUNT)
export async function getRecentPosts() {
  try {
    const posts = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.postCollectionId,
      [Query.orderDesc("$createdAt"), Query.limit(20)]
    );

    if (!posts) throw Error;

    return posts;
  } catch (error) {
    console.log(error);
  }
}

// ============================================================
// USER
// ============================================================

// ============================== GET USERS
export async function getUsers(limit?: number) {
  const queries: any[] = [Query.orderDesc("$createdAt")];

  if (limit) {
    queries.push(Query.limit(limit));
  }

  try {
    const users = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      queries
    );

    if (!users) throw Error;

    return users;
  } catch (error) {
    console.log(error);
  }
}

// ============================== GET USER BY ID
export async function getUserById(userId: string) {
  try {
    const user = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      userId
    );

    if (!user) throw Error;

    return user;
  } catch (error) {
    console.log(error);
  }
}

// ============================== UPDATE USER
export async function updateUser(user: IUpdateUser) {
  const hasFileToUpdate = user.file.length > 0;
  try {
    let image = {
      imageUrl: user.imageUrl,
      imageId: user.imageId,
    };

    if (hasFileToUpdate) {
      // Upload new file to appwrite storage
      const uploadedFile = await uploadFile(user.file[0]);
      if (!uploadedFile) throw Error;

      // Get new file url
      const fileUrl = getFilePreview(uploadedFile.$id);
      if (!fileUrl) {
        await deleteFile(uploadedFile.$id);
        throw Error;
      }

      image = { ...image, imageUrl: fileUrl, imageId: uploadedFile.$id };
    }

    //  Update user
    const updatedUser = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      user.userId,
      {
        name: user.name,
        bio: user.bio,
        imageUrl: image.imageUrl,
        imageId: image.imageId,
      }
    );

    // Failed to update
    if (!updatedUser) {
      // Delete new file that has been recently uploaded
      if (hasFileToUpdate) {
        await deleteFile(image.imageId);
      }
      // If no new file uploaded, just throw error
      throw Error;
    }

    // Safely delete old file after successful update
    if (user.imageId && hasFileToUpdate) {
      await deleteFile(user.imageId);
    }

    return updatedUser;
  } catch (error) {
    console.log(error);
  }
}


// import { ID, ImageGravity, Query } from "appwrite";
// import { appwriteConfig, account, databases, storage, avatars } from "./config";
// import { IUpdatePost, INewPost, INewUser, IUpdateUser } from "@/types";

// // USER ACCOUNT FUNCTIONS
// export async function createUserAccount(user: INewUser) {
//   try {
//     const newAccount = await account.create(
//       ID.unique(),
//       user.email,
//       user.password,
//       user.name
//     );

//     if (!newAccount) throw new Error("Account creation failed");

//     const avatarUrl = avatars.getInitials(user.name);

//     const newUser = await saveUserToDB({
//       accountId: newAccount.$id,
//       name: newAccount.name,
//       email: newAccount.email,
//       username: user.username,
//       imageUrl: avatarUrl,
//     });

//     return newUser;
//   } catch (error) {
//     console.log(error);
//     return error;
//   }
// }

// export async function signInAccount(user: { email: string; password: string }) {
//   try {
//     const session = await account.createSession(user.email, user.password);
//     return session;
//   } catch (error) {
//     console.log(error);
//   }
// }

// export async function saveUserToDB(user: {
//   accountId: string;
//   email: string;
//   name: string;
//   imageUrl: URL;
//   username?: string;
// }) {
//   try {
//     const newUser = await databases.createDocument(
//       appwriteConfig.databaseId,
//       appwriteConfig.userCollectionId,
//       ID.unique(),
//       user
//     );

//     return newUser;
//   } catch (error) {
//     console.log(error);
//   }
// }

// export async function getAccount() {
//   try {
//     const currentAccount = await account.get();
//     return currentAccount;
//   } catch (error) {
//     console.log(error);
//   }
// }

// export async function getCurrentUser() {
//   try {
//     const currentAccount = await getAccount();
//     if (!currentAccount) throw new Error("No current account");

//     const currentUser = await databases.listDocuments(
//       appwriteConfig.databaseId,
//       appwriteConfig.userCollectionId,
//       [Query.equal("accountId", currentAccount.$id)]
//     );

//     if (!currentUser) throw new Error("No current user");

//     return currentUser.documents[0];
//   } catch (error) {
//     console.log(error);
//     return null;
//   }
// }

// export async function signOutAccount() {
//   try {
//     const session = await account.deleteSession("current");
//     return session;
//   } catch (error) {
//     console.log(error);
//   }
// }

// // POST FUNCTIONS
// export async function createPost(post: INewPost) {
//   try {
//     const uploadedFile = await uploadFile(post.file[0]);
//     if (!uploadedFile) throw new Error("File upload failed");

//     const fileUrl = getFilePreview(uploadedFile.$id);
//     if (!fileUrl) {
//       await deleteFile(uploadedFile.$id);
//       throw new Error("File URL generation failed");
//     }

//     const tags = post.tags?.replace(/ /g, "").split(",") || [];

//     const newPost = await databases.createDocument(
//       appwriteConfig.databaseId,
//       appwriteConfig.postCollectionId,
//       ID.unique(),
//       {
//         creator: post.userId,
//         caption: post.caption,
//         imageUrl: fileUrl,
//         imageId: uploadedFile.$id,
//         location: post.location,
//         tags: tags,
//       }
//     );

//     if (!newPost) {
//       await deleteFile(uploadedFile.$id);
//       throw new Error("Post creation failed");
//     }

//     return newPost;
//   } catch (error) {
//     console.log(error);
//   }
// }

// export async function uploadFile(file: File) {
//   try {
//     const uploadedFile = await storage.createFile(
//       appwriteConfig.storageId,
//       ID.unique(),
//       file
//     );

//     return uploadedFile;
//   } catch (error) {
//     console.log(error);
//   }
// }

// export function getFilePreview(fileId: string) {
//   try {
//     const fileUrl = storage.getFilePreview(
//       appwriteConfig.storageId,
//       fileId,
//       2000,
//       2000,
//       ImageGravity.Top,
//       100
//     );

//     if (!fileUrl) throw new Error("File preview failed");

//     return fileUrl;
//   } catch (error) {
//     console.log(error);
//   }
// }

// export async function deleteFile(fileId: string) {
//   try {
//     await storage.deleteFile(appwriteConfig.storageId, fileId);
//     return { status: "ok" };
//   } catch (error) {
//     console.log(error);
//   }
// }

// export async function searchPosts(searchTerm: string) {
//   try {
//     const posts = await databases.listDocuments(
//       appwriteConfig.databaseId,
//       appwriteConfig.postCollectionId,
//       [Query.search("caption", searchTerm)]
//     );

//     if (!posts) throw new Error("Post search failed");

//     return posts;
//   } catch (error) {
//     console.log(error);
//   }
// }

// export async function getInfinitePosts({ pageParam }: { pageParam: number }) {
//   const queries: any[] = [Query.orderDesc("$updatedAt"), Query.limit(9)];

//   if (pageParam) {
//     queries.push(Query.cursorAfter(pageParam.toString()));
//   }

//   try {
//     const posts = await databases.listDocuments(
//       appwriteConfig.databaseId,
//       appwriteConfig.postCollectionId,
//       queries
//     );

//     if (!posts) throw new Error("Failed to fetch posts");

//     return posts;
//   } catch (error) {
//     console.log(error);
//   }
// }

// export async function getPostById(postId?: string) {
//   if (!postId) throw new Error("Post ID is required");

//   try {
//     const post = await databases.getDocument(
//       appwriteConfig.databaseId,
//       appwriteConfig.postCollectionId,
//       postId
//     );

//     if (!post) throw new Error("Post not found");

//     return post;
//   } catch (error) {
//     console.log(error);
//   }
// }

// export async function updatePost(post: IUpdatePost) {
//   const hasFileToUpdate = post.file.length > 0;

//   try {
//     let image = {
//       imageUrl: post.imageUrl,
//       imageId: post.imageId,
//     };

//     if (hasFileToUpdate) {
//       const uploadedFile = await uploadFile(post.file[0]);
//       if (!uploadedFile) throw new Error("File upload failed");

//       const fileUrl = getFilePreview(uploadedFile.$id);
//       if (!fileUrl) {
//         await deleteFile(uploadedFile.$id);
//         throw new Error("File URL generation failed");
//       }

//       image = { ...image, imageUrl: fileUrl, imageId: uploadedFile.$id };
//     }

//     const tags = post.tags?.replace(/ /g, "").split(",") || [];

//     const updatedPost = await databases.updateDocument(
//       appwriteConfig.databaseId,
//       appwriteConfig.postCollectionId,
//       post.postId,
//       {
//         caption: post.caption,
//         imageUrl: image.imageUrl,
//         imageId: image.imageId,
//         location: post.location,
//         tags: tags,
//       }
//     );

//     if (!updatedPost) {
//       if (hasFileToUpdate) {
//         await deleteFile(image.imageId);
//       }
//       throw new Error("Post update failed");
//     }

//     if (hasFileToUpdate) {
//       await deleteFile(post.imageId);
//     }

//     return updatedPost;
//   } catch (error) {
//     console.log(error);
//   }
// }

// export async function deletePost(postId?: string, imageId?: string) {
//   if (!postId || !imageId) return;

//   try {
//     const statusCode = await databases.deleteDocument(
//       appwriteConfig.databaseId,
//       appwriteConfig.postCollectionId,
//       postId
//     );

//     if (!statusCode) throw new Error("Post deletion failed");

//     await deleteFile(imageId);

//     return { status: "Ok" };
//   } catch (error) {
//     console.log(error);
//   }
// }

// export async function likePost(postId: string, likesArray: string[]) {
//   try {
//     const updatedPost = await databases.updateDocument(
//       appwriteConfig.databaseId,
//       appwriteConfig.postCollectionId,
//       postId,
//       { likes: likesArray }
//     );

//     if (!updatedPost) throw new Error("Failed to update likes");

//     return updatedPost;
//   } catch (error) {
//     console.log(error);
//   }
// }

// export async function savePost(userId: string, postId: string) {
//   try {
//     const updatedPost = await databases.createDocument(
//       appwriteConfig.databaseId,
//       appwriteConfig.savesCollectionId,
//       ID.unique(),
//       { user: userId, post: postId }
//     );

//     if (!updatedPost) throw new Error("Failed to save post");

//     return updatedPost;
//   } catch (error) {
//     console.log(error);
//   }
// }

// export async function deleteSavedPost(savedRecordId: string) {
//   try {
//     const statusCode = await databases.deleteDocument(
//       appwriteConfig.databaseId,
//       appwriteConfig.savesCollectionId,
//       savedRecordId
//     );

//     if (!statusCode) throw new Error("Failed to delete saved post");

//     return { status: "Ok" };
//   } catch (error) {
//     console.log(error);
//   }
// }

// export async function getUserPosts(userId?: string) {
//   if (!userId) return;

//   try {
//     const post = await databases.listDocuments(
//       appwriteConfig.databaseId,
//       appwriteConfig.postCollectionId,
//       [Query.equal("creator", userId), Query.orderDesc("$createdAt")]
//     );

//     return post;
//   } catch (error) {
//     console.log(error);
//   }
// }


// export async function getRecentPosts() {
//   try {
//     const posts = await databases.listDocuments(
//       appwriteConfig.databaseId,
//       appwriteConfig.postCollectionId,
//       [Query.orderDesc("$createdAt"), Query.limit(20)]
//     );

//     return posts;
//   } catch (error) {
//     console.log(error);
//   }
// }


// // ============================== GET USERS
// export async function getUsers(limit?: number) {
//   const queries: any[] = [Query.orderDesc("$createdAt")];

//   if (limit) {
//     queries.push(Query.limit(limit));
//   }

//   try {
//     const users = await databases.listDocuments(
//       appwriteConfig.databaseId,
//       appwriteConfig.userCollectionId,
//       queries
//     );

//     return users;
//   } catch (error) {
//     console.log(error);
//   }
// }

// // ============================== GET USER BY ID
// export async function getUserById(userId: string) {
//   try {
//     const user = await databases.getDocument(
//       appwriteConfig.databaseId,
//       appwriteConfig.userCollectionId,
//       userId
//     );

//     return user;
//   } catch (error) {
//     console.log(error);
//   }
// }

// // ============================== UPDATE USER
// export async function updateUser(user: IUpdateUser) {
//   const hasFileToUpdate = user.file.length > 0;
//   try {
//     let image = {
//       imageUrl: user.imageUrl,
//       imageId: user.imageId,
//     };

//     if (hasFileToUpdate) {
//       // Upload new file to appwrite storage
//       const uploadedFile = await uploadFile(user.file[0]);
//       if (!uploadedFile) throw Error;

//       // Get new file url
//       const fileUrl = getFilePreview(uploadedFile.$id);
//       if (!fileUrl) {
//         await deleteFile(uploadedFile.$id);
//         throw Error;
//       }

//       image = { ...image, imageUrl: fileUrl, imageId: uploadedFile.$id };
//     }

//     //  Update user
//     const updatedUser = await databases.updateDocument(
//       appwriteConfig.databaseId,
//       appwriteConfig.userCollectionId,
//       user.userId,
//       {
//         name: user.name,
//         bio: user.bio,
//         imageUrl: image.imageUrl,
//         imageId: image.imageId,
//       }
//     );

//     // Failed to update
//     if (!updatedUser) {
//       // Delete new file that has been recently uploaded
//       if (hasFileToUpdate) {
//         await deleteFile(image.imageId);
//       }
//       // If no new file uploaded, just throw error
//       throw Error;
//     }

//     // Safely delete old file after successful update
//     if (user.imageId && hasFileToUpdate) {
//       await deleteFile(user.imageId);
//     }

//     return updatedUser;
//   } catch (error) {
//     console.log(error);
//   }
// }
