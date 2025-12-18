import { Injectable, inject, runInInjectionContext, Injector } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  writeBatch
} from '@angular/fire/firestore';
import { Observable, from, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Review, ContentType, ReviewSummary } from '../../models';

@Injectable({
  providedIn: 'root'
})
export class ReviewService {
  private readonly REVIEWS_COLLECTION = 'reviews';
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  /**
   * Submit a new review or update an existing one
   */
  async submitReview(
    contentId: string,
    contentType: ContentType,
    userId: string,
    userDisplayName: string,
    userPhotoUrl: string | undefined,
    rating: number,
    comment?: string
  ): Promise<void> {
    // Check if user already has a review
    const existingReview = await this.getUserReviewAsync(contentId, contentType, userId);

    const reviewsRef = collection(this.firestore, this.REVIEWS_COLLECTION);
    const reviewRef = existingReview
      ? doc(this.firestore, `${this.REVIEWS_COLLECTION}/${existingReview.id}`)
      : doc(reviewsRef);

    const reviewData: Partial<Review> = {
      id: reviewRef.id,
      contentId,
      contentType,
      userId,
      userDisplayName,
      rating,
      updatedAt: serverTimestamp() as any
    };

    if (userPhotoUrl) {
      reviewData.userPhotoUrl = userPhotoUrl;
    }

    if (comment) {
      reviewData.comment = comment;
    }

    if (!existingReview) {
      reviewData.createdAt = serverTimestamp() as any;
      await setDoc(reviewRef, reviewData);
    } else {
      await updateDoc(reviewRef, reviewData);
    }

    // Recalculate average rating for the content
    await this.recalculateContentRating(contentId, contentType);
  }

  /**
   * Delete a review
   */
  async deleteReview(reviewId: string, contentId: string, contentType: ContentType): Promise<void> {
    const reviewRef = doc(this.firestore, `${this.REVIEWS_COLLECTION}/${reviewId}`);
    await deleteDoc(reviewRef);

    // Recalculate average rating
    await this.recalculateContentRating(contentId, contentType);
  }

  /**
   * Get all reviews for a piece of content
   */
  getReviewsForContent(
    contentId: string,
    contentType: ContentType,
    limitCount: number = 50
  ): Observable<Review[]> {
    const reviewsRef = collection(this.firestore, this.REVIEWS_COLLECTION);
    const q = query(
      reviewsRef,
      where('contentId', '==', contentId),
      where('contentType', '==', contentType),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    return from(
      runInInjectionContext(this.injector, () => getDocs(q))
    ).pipe(
      map(snapshot => {
        return snapshot.docs.map(doc => this.convertTimestamps(doc.data() as any));
      })
    );
  }

  /**
   * Get user's review for specific content (Observable version)
   */
  getUserReview(
    contentId: string,
    contentType: ContentType,
    userId: string
  ): Observable<Review | null> {
    const reviewsRef = collection(this.firestore, this.REVIEWS_COLLECTION);
    const q = query(
      reviewsRef,
      where('contentId', '==', contentId),
      where('contentType', '==', contentType),
      where('userId', '==', userId),
      limit(1)
    );

    return from(
      runInInjectionContext(this.injector, () => getDocs(q))
    ).pipe(
      map(snapshot => {
        if (snapshot.empty) {
          return null;
        }
        return this.convertTimestamps(snapshot.docs[0].data() as any);
      })
    );
  }

  /**
   * Get user's review for specific content (async version)
   */
  async getUserReviewAsync(
    contentId: string,
    contentType: ContentType,
    userId: string
  ): Promise<Review | null> {
    const reviewsRef = collection(this.firestore, this.REVIEWS_COLLECTION);
    const q = query(
      reviewsRef,
      where('contentId', '==', contentId),
      where('contentType', '==', contentType),
      where('userId', '==', userId),
      limit(1)
    );

    const snapshot = await runInInjectionContext(this.injector, () => getDocs(q));

    if (snapshot.empty) {
      return null;
    }

    return this.convertTimestamps(snapshot.docs[0].data() as any);
  }

  /**
   * Get review summary (average, count, distribution) for content
   */
  getReviewSummary(contentId: string, contentType: ContentType): Observable<ReviewSummary> {
    return this.getReviewsForContent(contentId, contentType, 1000).pipe(
      map(reviews => {
        if (reviews.length === 0) {
          return {
            averageRating: 0,
            ratingCount: 0,
            ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
          };
        }

        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        let total = 0;

        reviews.forEach(review => {
          total += review.rating;
          const ratingKey = review.rating as 1 | 2 | 3 | 4 | 5;
          distribution[ratingKey]++;
        });

        return {
          averageRating: total / reviews.length,
          ratingCount: reviews.length,
          ratingDistribution: distribution
        };
      })
    );
  }

  /**
   * Recalculate and update the average rating on the content document
   */
  private async recalculateContentRating(
    contentId: string,
    contentType: ContentType
  ): Promise<void> {
    const reviewsRef = collection(this.firestore, this.REVIEWS_COLLECTION);
    const q = query(
      reviewsRef,
      where('contentId', '==', contentId),
      where('contentType', '==', contentType)
    );

    const snapshot = await runInInjectionContext(this.injector, () => getDocs(q));

    let averageRating = 0;
    let ratingCount = 0;

    if (!snapshot.empty) {
      let total = 0;
      snapshot.docs.forEach(doc => {
        const review = doc.data() as Review;
        total += review.rating;
      });
      ratingCount = snapshot.size;
      averageRating = total / ratingCount;
    }

    // Update the content document with the new average
    const collectionName = this.getCollectionName(contentType);
    const contentRef = doc(this.firestore, `${collectionName}/${contentId}`);

    await updateDoc(contentRef, {
      averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
      ratingCount,
      updatedAt: serverTimestamp()
    });
  }

  /**
   * Get the Firestore collection name for a content type
   */
  private getCollectionName(contentType: ContentType): string {
    switch (contentType) {
      case 'quiz':
        return 'quizzes';
      case 'deck':
        return 'flashcardDecks';
      case 'material':
        return 'learningMaterials';
      case 'theme':
        return 'themes';
    }
  }

  /**
   * Convert Firestore Timestamps to JavaScript Dates
   */
  private convertTimestamps(data: any): Review {
    return {
      ...data,
      createdAt: data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : data.createdAt,
      updatedAt: data.updatedAt instanceof Timestamp
        ? data.updatedAt.toDate()
        : data.updatedAt
    };
  }
}
