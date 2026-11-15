package org.example.yci_web.Repository;

import org.example.yci_web.Entity.UserEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UserRepository extends JpaRepository<UserEntity, Long> {
    UserEntity findByEmail(String email);
    UserEntity findByCccd(String cccd);
    List<UserEntity> findByRole(Integer role);  // 0=admin, 2=staff
}
